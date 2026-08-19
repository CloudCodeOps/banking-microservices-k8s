"""Cheques microservice - issue a cheque (no funds move yet, like a real
cheque), then clear it later (funds actually debit at that point - if
the balance isn't there, the cheque bounces instead of the request
failing)."""
import os
import sys
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, field_validator

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import dynamodb_client, raw_table_name, table, to_ddb_item
from common.service_base import adjust_balance, get_account_or_404, new_id, now_iso, write_audit_log

app = FastAPI(title="VeeraBank Cheques Service", version="2.0.0")
router = APIRouter(prefix="/cheques")
tbl = table("cheques")
accounts_table = table("accounts")


class ChequeIssue(BaseModel):
    user_id: str
    account_id: str
    payee_name: str
    amount: Decimal
    # Required: a cheque must name a real destination account, so the
    # money actually lands somewhere the instant it clears (see clear()
    # below) instead of just vanishing from the issuer's balance.
    payee_account_number: str

    @field_validator("amount")
    @classmethod
    def _positive(cls, v):
        if v <= 0:
            raise ValueError("amount must be greater than zero")
        return v


def _resolve_payee_account(account_number: str) -> dict:
    resp = accounts_table.query(
        IndexName="account_number-index",
        KeyConditionExpression="account_number = :n",
        ExpressionAttributeValues={":n": account_number},
        Limit=1,
    )
    items = [i for i in resp.get("Items", []) if i.get("record_type") == "account"]
    if not items:
        raise HTTPException(status_code=404, detail="No account with that payee account number")
    return items[0]


def _cheque_number() -> str:
    import random
    return "".join(str(random.randint(0, 9)) for _ in range(6))


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "cheques-service", "status": "running"}


@router.post("/issue", status_code=201)
def issue(payload: ChequeIssue):
    account = get_account_or_404(payload.account_id)
    if account["user_id"] != payload.user_id:
        raise HTTPException(status_code=403, detail="You can only issue cheques from your own account")

    payee_account = _resolve_payee_account(payload.payee_account_number)
    if payee_account["account_id"] == payload.account_id:
        raise HTTPException(status_code=400, detail="You can't write a cheque to your own account")
    payee_account_id = payee_account["account_id"]

    item = {
        "id": new_id(),
        "user_id": payload.user_id,
        "account_id": payload.account_id,
        "cheque_number": _cheque_number(),
        "payee_name": payload.payee_name,
        "payee_account_id": payee_account_id,
        "amount": payload.amount,
        "status": "issued",
        "created_at": now_iso(),
    }
    tbl.put_item(Item=item)
    write_audit_log(payload.user_id, "cheque_issued", {"cheque_id": item["id"], "payee": payload.payee_name})
    return item


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    resp = tbl.query(IndexName="user_id-index", KeyConditionExpression="user_id = :u", ExpressionAttributeValues={":u": user_id})
    return sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)


@router.get("/{cheque_id}")
def get_cheque(cheque_id: str):
    resp = tbl.get_item(Key={"id": cheque_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Cheque not found")
    return item


@router.patch("/{cheque_id}/clear")
def clear(cheque_id: str):
    resp = tbl.get_item(Key={"id": cheque_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Cheque not found")
    if item["status"] != "issued":
        raise HTTPException(status_code=400, detail=f"Cheque is already {item['status']}")

    payee_account_id = item.get("payee_account_id")

    if payee_account_id:
        # Real payee on file: debit issuer + credit payee in one atomic
        # transaction, same pattern transfers-service uses, so the money
        # actually lands in the payee's account instead of disappearing.
        client = dynamodb_client()
        accounts_table_name = raw_table_name("accounts")
        try:
            client.transact_write_items(
                TransactItems=[
                    {
                        "Update": {
                            "TableName": accounts_table_name,
                            "Key": to_ddb_item({"account_id": item["account_id"]}),
                            "UpdateExpression": "SET balance = balance - :amt",
                            "ConditionExpression": (
                                "attribute_exists(account_id) AND record_type = :acct "
                                "AND #st = :active AND balance >= :amt"
                            ),
                            "ExpressionAttributeNames": {"#st": "status"},
                            "ExpressionAttributeValues": to_ddb_item(
                                {":amt": Decimal(item["amount"]), ":acct": "account", ":active": "active"}
                            ),
                        }
                    },
                    {
                        "Update": {
                            "TableName": accounts_table_name,
                            "Key": to_ddb_item({"account_id": payee_account_id}),
                            "UpdateExpression": "SET balance = balance + :amt",
                            "ConditionExpression": (
                                "attribute_exists(account_id) AND record_type = :acct AND #st = :active"
                            ),
                            "ExpressionAttributeNames": {"#st": "status"},
                            "ExpressionAttributeValues": to_ddb_item(
                                {":amt": Decimal(item["amount"]), ":acct": "account", ":active": "active"}
                            ),
                        }
                    },
                ]
            )
            new_status = "cleared"
        except client.exceptions.TransactionCanceledException:
            new_status = "bounced"
    else:
        # Legacy / no-payee-on-file cheque: same behavior as before.
        try:
            adjust_balance(item["account_id"], -Decimal(item["amount"]))
            new_status = "cleared"
        except HTTPException as e:
            if e.status_code != 402:
                raise
            new_status = "bounced"

    tbl.update_item(Key={"id": cheque_id}, UpdateExpression="SET #s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": new_status})
    write_audit_log(item["user_id"], "cheque_" + new_status, {"cheque_id": cheque_id})
    return {**item, "status": new_status}


app.include_router(router)
