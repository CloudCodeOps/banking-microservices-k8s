"""Transfers microservice - REAL money movement between two VeeraBank
accounts, not a generic CRUD log.

A transfer is one atomic DynamoDB transaction that:
  1. debits the source account (only if it has sufficient funds - the
     balance check is itself a ConditionExpression inside the
     transaction, so it can never be raced into overdraft), and
  2. credits the destination account, and
  3. writes a single ledger row into the transfers table,
all-or-nothing. If any one part fails, none of it applies.
"""
import os
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

import requests
from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import dynamodb_client, raw_table_name, table, to_ddb_item
from common.service_base import new_id, now_iso, write_audit_log
from common.mailer import send_transfer_sent_email, send_transfer_received_email

USERS_SERVICE_URL = os.environ.get(
    "USERS_SERVICE_URL", "http://users-svc.veerabank.svc.cluster.local"
)

SERVICE_NAME = "transfers"
app = FastAPI(title="VeeraBank Transfers Service", version="2.0.0")
router = APIRouter(prefix="/transfers")

transfers_table = table(SERVICE_NAME)
accounts_table = table("accounts")

# Same per-user activity-history Lambda (behind API Gateway) that
# users-service writes to on registration - see backend/lambdas/
# transactions_history and terraform/lambda.tf. Optional: a transfer
# still completes if this isn't set, it just won't show up in either
# party's S3 history feed.
HISTORY_API_URL = os.environ.get("TRANSACTIONS_HISTORY_API_URL", "").rstrip("/")

# Any single transfer at or above this gets auto-flagged for staff review
# in fraud-detection-service - a real rule firing, not a manually-entered
# CRUD row.
FRAUD_FLAG_THRESHOLD = Decimal("10000")
# Sender earns 1 rewards point per $100 sent, credited straight into
# rewards-service's ledger.
REWARD_POINTS_PER_100 = 1


class TransferRequest(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: Decimal
    user_id: str = Field(..., description="user_id of the person initiating the transfer - must own from_account_id")
    note: Optional[str] = None
    sender_name: Optional[str] = Field(None, description="Display name of the sender, sent by the client alongside the transfer")
    sender_email: Optional[str] = Field(None, description="Email of the sender, sent by the client alongside the transfer")

    @field_validator("amount")
    @classmethod
    def _positive_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("amount must be greater than zero")
        return v


class Transfer(BaseModel):
    id: str
    from_account_id: str
    to_account_id: str
    from_user_id: str
    to_user_id: str
    amount: Decimal
    note: Optional[str] = None
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    status: str
    created_at: str


def _get_account(account_id: str) -> dict:
    resp = accounts_table.get_item(Key={"account_id": account_id})
    item = resp.get("Item")
    if not item or item.get("record_type") != "account":
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    return item


def _get_user(user_id: str) -> Optional[dict]:
    """Best-effort lookup of a user's email/name via users-service - used
    only to email the recipient of a transfer. A failure here must never
    break the transfer itself (money already moved by this point)."""
    try:
        resp = requests.get(f"{USERS_SERVICE_URL}/users/{user_id}", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:  # noqa: BLE001
        print(f"[transfers] failed to look up recipient user {user_id}: {exc}")
        return None


def _write_history_event(user_id: str, event_type: str, details: dict):
    if not HISTORY_API_URL:
        print("[transfers] TRANSACTIONS_HISTORY_API_URL not set, skipping history write")
        return
    try:
        payload = {"user_id": user_id, "event_type": event_type, **details}
        resp = requests.post(f"{HISTORY_API_URL}/history", json=payload, timeout=5)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001 - history logging must never break a transfer
        print(f"[transfers] failed to write history event: {exc}")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "transfers-service", "status": "running"}


@router.post("", response_model=Transfer, status_code=201)
@router.post("/", response_model=Transfer, status_code=201, include_in_schema=False)
def create_transfer(req: TransferRequest):
    if req.from_account_id == req.to_account_id:
        raise HTTPException(status_code=400, detail="Cannot transfer to the same account")

    from_acct = _get_account(req.from_account_id)
    to_acct = _get_account(req.to_account_id)

    if from_acct["user_id"] != req.user_id:
        raise HTTPException(status_code=403, detail="You can only send money from your own account")

    if from_acct.get("status") != "active" or to_acct.get("status") != "active":
        raise HTTPException(status_code=400, detail="Both accounts must be active")

    transfer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    transfer_item = {
        "id": transfer_id,
        "from_account_id": req.from_account_id,
        "to_account_id": req.to_account_id,
        "from_user_id": from_acct["user_id"],
        "to_user_id": to_acct["user_id"],
        "amount": req.amount,
        "note": req.note or "",
        "sender_name": req.sender_name or "",
        "sender_email": req.sender_email or "",
        "status": "completed",
        "created_at": now,
    }

    client = dynamodb_client()
    accounts_table_name = raw_table_name("accounts")
    transfers_table_name = raw_table_name(SERVICE_NAME)

    try:
        client.transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": accounts_table_name,
                        "Key": to_ddb_item({"account_id": req.from_account_id}),
                        "UpdateExpression": "SET balance = balance - :amt",
                        "ConditionExpression": (
                            "attribute_exists(account_id) AND record_type = :acct "
                            "AND #st = :active AND balance >= :amt"
                        ),
                        "ExpressionAttributeNames": {"#st": "status"},
                        "ExpressionAttributeValues": to_ddb_item(
                            {":amt": req.amount, ":acct": "account", ":active": "active"}
                        ),
                    }
                },
                {
                    "Update": {
                        "TableName": accounts_table_name,
                        "Key": to_ddb_item({"account_id": req.to_account_id}),
                        "UpdateExpression": "SET balance = balance + :amt",
                        "ConditionExpression": (
                            "attribute_exists(account_id) AND record_type = :acct AND #st = :active"
                        ),
                        "ExpressionAttributeNames": {"#st": "status"},
                        "ExpressionAttributeValues": to_ddb_item(
                            {":amt": req.amount, ":acct": "account", ":active": "active"}
                        ),
                    }
                },
                {
                    "Put": {
                        "TableName": transfers_table_name,
                        "Item": to_ddb_item(transfer_item),
                        "ConditionExpression": "attribute_not_exists(id)",
                    }
                },
            ]
        )
    except client.exceptions.TransactionCanceledException as exc:
        reasons = exc.response.get("CancellationReasons", [])
        if reasons and reasons[0].get("Code") == "ConditionalCheckFailed":
            raise HTTPException(status_code=402, detail="Insufficient funds in the source account")
        raise HTTPException(status_code=409, detail="Transfer could not be completed - accounts changed, try again")

    _write_history_event(
        from_acct["user_id"],
        "transfer_out",
        {"transfer_id": transfer_id, "to_account_id": req.to_account_id, "amount": str(req.amount)},
    )
    _write_history_event(
        to_acct["user_id"],
        "transfer_in",
        {
            "transfer_id": transfer_id,
            "from_account_id": req.from_account_id,
            "amount": str(req.amount),
            "sender_name": req.sender_name or "",
            "sender_email": req.sender_email or "",
        },
    )

    # Email both sides. The sender's own email came with the request
    # (typed once at signup, never re-typed here); the recipient's has to
    # be looked up via users-service since a transfer only carries account
    # ids. Neither lookup nor send can undo the transfer at this point, so
    # both are best-effort and never raise.
    if req.sender_email:
        try:
            send_transfer_sent_email(req.sender_email, req.sender_name or "there", to_acct["owner_name"], req.amount, req.note)
        except Exception as exc:  # noqa: BLE001
            print(f"[transfers] failed to send sender confirmation email: {exc}")

    to_user = _get_user(to_acct["user_id"])
    if to_user and to_user.get("email"):
        try:
            send_transfer_received_email(to_user["email"], to_user.get("full_name") or "there", req.sender_name or "Someone", req.amount, req.note)
        except Exception as exc:  # noqa: BLE001
            print(f"[transfers] failed to send recipient notification email: {exc}")

    write_audit_log(
        from_acct["user_id"],
        "transfer_sent",
        {"transfer_id": transfer_id, "to_account_id": req.to_account_id, "amount": str(req.amount)},
    )

    if req.amount >= FRAUD_FLAG_THRESHOLD:
        try:
            table("fraud-detection").put_item(
                Item={
                    "id": new_id(),
                    "transfer_id": transfer_id,
                    "user_id": from_acct["user_id"],
                    "reason": f"Transfer of {req.amount} met or exceeded the {FRAUD_FLAG_THRESHOLD} review threshold",
                    "amount": req.amount,
                    "status": "open",
                    "created_at": now_iso(),
                }
            )
        except Exception as exc:  # noqa: BLE001 - a flagging failure must never break the transfer itself
            print(f"[transfers] failed to write fraud flag: {exc}")

    points = int(req.amount // Decimal(100)) * REWARD_POINTS_PER_100
    if points > 0:
        try:
            table("rewards").put_item(
                Item={
                    "id": new_id(),
                    "user_id": from_acct["user_id"],
                    "kind": "earn",
                    "points": points,
                    "description": f"Reward for transfer {transfer_id}",
                    "created_at": now_iso(),
                }
            )
        except Exception as exc:  # noqa: BLE001 - rewards are a bonus, never block the transfer
            print(f"[transfers] failed to award reward points: {exc}")

    return transfer_item


@router.get("/{transfer_id}", response_model=Transfer)
def get_transfer(transfer_id: str):
    resp = transfers_table.get_item(Key={"id": transfer_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return item


@router.get("/account/{account_id}", response_model=List[Transfer])
def list_transfers_for_account(account_id: str):
    """Every transfer this account was either the sender or receiver of,
    newest first."""
    sent = transfers_table.query(
        IndexName="from_account_id-index",
        KeyConditionExpression="from_account_id = :a",
        ExpressionAttributeValues={":a": account_id},
    ).get("Items", [])
    received = transfers_table.query(
        IndexName="to_account_id-index",
        KeyConditionExpression="to_account_id = :a",
        ExpressionAttributeValues={":a": account_id},
    ).get("Items", [])
    combined = {t["id"]: t for t in sent + received}.values()
    return sorted(combined, key=lambda t: t["created_at"], reverse=True)


app.include_router(router)
