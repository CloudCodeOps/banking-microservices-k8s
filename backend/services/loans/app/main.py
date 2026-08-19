"""Loans microservice - apply for a real loan against a VeeraBank
account. Small principals auto-approve and disburse immediately
(atomically credited to the account); larger ones go to pending_review
for a staff approval via /loans/{id}/approve."""
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

app = FastAPI(title="VeeraBank Loans Service", version="2.0.0")
router = APIRouter(prefix="/loans")
tbl = table("loans")

AUTO_APPROVE_CEILING = Decimal("500000")
ANNUAL_RATE_PERCENT = Decimal("10.5")


class LoanApplication(BaseModel):
    user_id: str
    account_id: str
    principal: Decimal
    tenure_months: int
    purpose: str = ""

    @field_validator("principal")
    @classmethod
    def _positive(cls, v):
        if v <= 0:
            raise ValueError("principal must be greater than zero")
        return v

    @field_validator("tenure_months")
    @classmethod
    def _valid_tenure(cls, v):
        if not (1 <= v <= 360):
            raise ValueError("tenure_months must be between 1 and 360")
        return v


def _emi(principal: Decimal, tenure_months: int) -> Decimal:
    r = (ANNUAL_RATE_PERCENT / Decimal(100)) / Decimal(12)
    if r == 0:
        return (principal / tenure_months).quantize(Decimal("0.01"))
    factor = (1 + r) ** tenure_months
    emi = principal * r * factor / (factor - 1)
    return Decimal(emi).quantize(Decimal("0.01"))


def _disburse(loan: dict):
    adjust_balance(loan["account_id"], Decimal(loan["principal"]))
    tbl.update_item(
        Key={"id": loan["id"]},
        UpdateExpression="SET #s = :s, disbursed_at = :d",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": "active", ":d": now_iso()},
    )
    write_audit_log(loan["user_id"], "loan_disbursed", {"loan_id": loan["id"], "principal": str(loan["principal"])})


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "loans-service", "status": "running"}


@router.post("/apply", status_code=201)
def apply(payload: LoanApplication):
    account = get_account_or_404(payload.account_id)
    if account["user_id"] != payload.user_id:
        raise HTTPException(status_code=403, detail="You can only borrow against your own account")

    now = datetime.now(timezone.utc)
    auto_approved = payload.principal <= AUTO_APPROVE_CEILING
    item = {
        "id": new_id(),
        "user_id": payload.user_id,
        "account_id": payload.account_id,
        "principal": payload.principal,
        "tenure_months": payload.tenure_months,
        "purpose": payload.purpose,
        "annual_rate_percent": ANNUAL_RATE_PERCENT,
        "monthly_emi": _emi(payload.principal, payload.tenure_months),
        "status": "pending_review",
        "created_at": now_iso(),
        "maturity_date": (now + timedelta(days=30 * payload.tenure_months)).date().isoformat(),
    }
    tbl.put_item(Item=item)
    write_audit_log(payload.user_id, "loan_applied", {"loan_id": item["id"], "principal": str(payload.principal)})

    if auto_approved:
        _disburse(item)
        item["status"] = "active"

    return item


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    resp = tbl.query(IndexName="user_id-index", KeyConditionExpression="user_id = :u", ExpressionAttributeValues={":u": user_id})
    return sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)


@router.get("/pending", response_model=List[dict])
def list_pending():
    """Staff queue: every loan still awaiting a manual decision."""
    resp = tbl.scan(FilterExpression="#s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "pending_review"})
    return resp.get("Items", [])


@router.get("/{loan_id}")
def get_loan(loan_id: str):
    resp = tbl.get_item(Key={"id": loan_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Loan not found")
    return item


@router.patch("/{loan_id}/approve")
def approve(loan_id: str):
    resp = tbl.get_item(Key={"id": loan_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Loan not found")
    if item["status"] != "pending_review":
        raise HTTPException(status_code=400, detail=f"Loan is already {item['status']}")
    _disburse(item)
    return {**item, "status": "active"}


@router.patch("/{loan_id}/reject")
def reject(loan_id: str):
    resp = tbl.get_item(Key={"id": loan_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Loan not found")
    if item["status"] != "pending_review":
        raise HTTPException(status_code=400, detail=f"Loan is already {item['status']}")
    tbl.update_item(Key={"id": loan_id}, UpdateExpression="SET #s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "rejected"})
    return {**item, "status": "rejected"}


app.include_router(router)
