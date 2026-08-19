"""Shared building blocks for the "per-user" backend microservices (cards,
loans, payments, beneficiaries, kyc, fixed-deposits, cheques, disputes,
support-tickets, rewards, notifications). Each of those tables has an
`id` hash key plus a `user_id` GSI (see terraform/dynamodb.tf), so the
list/get/delete plumbing is identical - only the create logic and any
domain-specific actions (freeze a card, approve a loan, ...) differ
service to service.

This intentionally does NOT hide create/update behind a generic
JSON-blob endpoint - each service still defines its own typed Pydantic
model and its own domain endpoints; this module only removes the
copy-pasted list/get/delete boilerplate.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from common.aws_clients import table


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_user_scoped_router(prefix: str, table_name: str) -> tuple[APIRouter, Any]:
    """Returns (router, table) with GET /<prefix>/user/{user_id} (list,
    newest first), GET /<prefix>/{item_id}, and DELETE /<prefix>/{item_id}
    already wired up against the given table's user_id-index GSI. The
    service that calls this still adds its own POST (and any other
    domain-specific routes) to the returned router."""
    router = APIRouter(prefix=f"/{prefix}")
    tbl = table(table_name)

    @router.get("/")
    def root():
        return {"service": f"{prefix}-service", "status": "running"}

    @router.get("/user/{user_id}")
    def list_for_user(user_id: str):
        resp = tbl.query(
            IndexName="user_id-index",
            KeyConditionExpression="user_id = :u",
            ExpressionAttributeValues={":u": user_id},
        )
        items = resp.get("Items", [])
        return sorted(items, key=lambda i: i.get("created_at", ""), reverse=True)

    @router.get("/{item_id}")
    def get_item(item_id: str):
        resp = tbl.get_item(Key={"id": item_id})
        item = resp.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail=f"{prefix} item not found")
        return item

    @router.delete("/{item_id}", status_code=204)
    def delete_item(item_id: str):
        resp = tbl.get_item(Key={"id": item_id})
        if not resp.get("Item"):
            raise HTTPException(status_code=404, detail=f"{prefix} item not found")
        tbl.delete_item(Key={"id": item_id})

    return router, tbl


def get_account_or_404(account_id: str) -> Dict[str, Any]:
    """Small shared helper: services that need to touch a real account
    (loans disbursing funds, fixed-deposits/cheques debiting funds, ...)
    all need this same lookup - kept in one place so the "must be an
    active account record" check can't drift between services."""
    accounts_table = table("accounts")
    resp = accounts_table.get_item(Key={"account_id": account_id})
    item = resp.get("Item")
    if not item or item.get("record_type") != "account":
        raise HTTPException(status_code=404, detail="Account not found")
    return item


def adjust_balance(account_id: str, delta) -> None:
    """Atomically adjusts an account's balance by `delta` (positive to
    credit, negative to debit). Used by services that move real money
    outside of a peer-to-peer transfer (loan disbursement, FD funding,
    cheque clearing, bill payments). Raises HTTPException(402) if a debit
    would overdraw the account."""
    from decimal import Decimal

    from botocore.exceptions import ClientError

    accounts_table = table("accounts")
    try:
        if delta < 0:
            accounts_table.update_item(
                Key={"account_id": account_id},
                UpdateExpression="SET balance = balance + :d",
                ConditionExpression="attribute_exists(account_id) AND balance >= :min",
                ExpressionAttributeValues={":d": Decimal(delta), ":min": Decimal(-delta)},
            )
        else:
            accounts_table.update_item(
                Key={"account_id": account_id},
                UpdateExpression="SET balance = balance + :d",
                ConditionExpression="attribute_exists(account_id)",
                ExpressionAttributeValues={":d": Decimal(delta)},
            )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise HTTPException(status_code=402, detail="Insufficient funds")
        raise


def write_audit_log(actor_user_id: str, action: str, details: Dict[str, Any]) -> None:
    """Best-effort audit trail write - never blocks or breaks the calling
    request if it fails. Read back via GET /audit-log/user/{user_id} or
    (for staff) GET /audit-log/all."""
    try:
        tbl = table("audit-log")
        tbl.put_item(
            Item={
                "id": new_id(),
                "user_id": actor_user_id,
                "action": action,
                "details": details,
                "created_at": now_iso(),
            }
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[audit-log] failed to write entry: {exc}")
