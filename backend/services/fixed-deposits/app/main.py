"""Fixed Deposits microservice - open an FD (debits the account for real),
tracks a computed maturity amount/date, and lets you close it (early or
at maturity), crediting the account back."""
import os
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, field_validator

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table
from common.service_base import adjust_balance, get_account_or_404, new_id, now_iso, write_audit_log

app = FastAPI(title="VeeraBank Fixed Deposits Service", version="2.0.0")
router = APIRouter(prefix="/fixed-deposits")
tbl = table("fixed-deposits")

DEFAULT_RATE_PERCENT = Decimal("6.5")
EARLY_WITHDRAWAL_PENALTY_PERCENT = Decimal("1.0")


class FdCreate(BaseModel):
    user_id: str
    account_id: str
    principal: Decimal
    tenure_months: int

    @field_validator("principal")
    @classmethod
    def _positive(cls, v):
        if v <= 0:
            raise ValueError("principal must be greater than zero")
        return v

    @field_validator("tenure_months")
    @classmethod
    def _valid_tenure(cls, v):
        if not (1 <= v <= 120):
            raise ValueError("tenure_months must be between 1 and 120")
        return v


def _maturity_amount(principal: Decimal, tenure_months: int, rate: Decimal = DEFAULT_RATE_PERCENT) -> Decimal:
    interest = principal * rate / Decimal(100) * Decimal(tenure_months) / Decimal(12)
    return (principal + interest).quantize(Decimal("0.01"))


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "fixed-deposits-service", "status": "running"}


@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def open_fd(payload: FdCreate):
    account = get_account_or_404(payload.account_id)
    if account["user_id"] != payload.user_id:
        raise HTTPException(status_code=403, detail="You can only fund an FD from your own account")

    adjust_balance(payload.account_id, -payload.principal)  # raises 402 if insufficient funds

    now = datetime.now(timezone.utc)
    item = {
        "id": new_id(),
        "user_id": payload.user_id,
        "account_id": payload.account_id,
        "principal": payload.principal,
        "tenure_months": payload.tenure_months,
        "rate_percent": DEFAULT_RATE_PERCENT,
        "maturity_amount": _maturity_amount(payload.principal, payload.tenure_months),
        "maturity_date": (now + timedelta(days=30 * payload.tenure_months)).date().isoformat(),
        "status": "active",
        "created_at": now_iso(),
    }
    tbl.put_item(Item=item)
    write_audit_log(payload.user_id, "fd_opened", {"fd_id": item["id"], "principal": str(payload.principal)})
    return item


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    resp = tbl.query(IndexName="user_id-index", KeyConditionExpression="user_id = :u", ExpressionAttributeValues={":u": user_id})
    return sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)


@router.get("/{fd_id}")
def get_fd(fd_id: str):
    resp = tbl.get_item(Key={"id": fd_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Fixed deposit not found")
    return item


@router.patch("/{fd_id}/close")
def close_fd(fd_id: str):
    resp = tbl.get_item(Key={"id": fd_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Fixed deposit not found")
    if item["status"] != "active":
        raise HTTPException(status_code=400, detail=f"FD is already {item['status']}")

    matured = datetime.now(timezone.utc).date().isoformat() >= item["maturity_date"]
    if matured:
        payout = Decimal(item["maturity_amount"])
        outcome = "matured"
    else:
        penalty = Decimal(item["principal"]) * EARLY_WITHDRAWAL_PENALTY_PERCENT / Decimal(100)
        payout = (Decimal(item["principal"]) - penalty).quantize(Decimal("0.01"))
        outcome = "closed_early"

    adjust_balance(item["account_id"], payout)
    tbl.update_item(
        Key={"id": fd_id},
        UpdateExpression="SET #s = :s, payout_amount = :p, closed_at = :c",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": outcome, ":p": payout, ":c": now_iso()},
    )
    write_audit_log(item["user_id"], "fd_closed", {"fd_id": fd_id, "outcome": outcome, "payout": str(payout)})
    return {**item, "status": outcome, "payout_amount": payout}


app.include_router(router)
