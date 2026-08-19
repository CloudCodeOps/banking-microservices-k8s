"""Payments microservice - real bill payments out of a VeeraBank account
to an external payee (electricity, phone, credit card, ...). Unlike a
transfer, money leaves the bank entirely, so only the sender's balance
moves (atomically, with an insufficient-funds check)."""
import os
import sys
from decimal import Decimal
from typing import List

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, field_validator

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table
from common.service_base import adjust_balance, get_account_or_404, new_id, now_iso, write_audit_log

app = FastAPI(title="VeeraBank Payments Service", version="2.0.0")
router = APIRouter(prefix="/payments")
tbl = table("payments")


class PaymentCreate(BaseModel):
    user_id: str
    account_id: str
    payee_name: str
    category: str = "other"
    amount: Decimal

    @field_validator("amount")
    @classmethod
    def _positive(cls, v):
        if v <= 0:
            raise ValueError("amount must be greater than zero")
        return v


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "payments-service", "status": "running"}


@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def pay(payload: PaymentCreate):
    account = get_account_or_404(payload.account_id)
    if account["user_id"] != payload.user_id:
        raise HTTPException(status_code=403, detail="You can only pay from your own account")

    adjust_balance(payload.account_id, -payload.amount)  # raises 402 if insufficient funds

    item = {
        "id": new_id(),
        "user_id": payload.user_id,
        "account_id": payload.account_id,
        "payee_name": payload.payee_name,
        "category": payload.category,
        "amount": payload.amount,
        "status": "completed",
        "created_at": now_iso(),
    }
    tbl.put_item(Item=item)
    write_audit_log(payload.user_id, "bill_paid", {"payment_id": item["id"], "payee": payload.payee_name, "amount": str(payload.amount)})
    return item


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    resp = tbl.query(IndexName="user_id-index", KeyConditionExpression="user_id = :u", ExpressionAttributeValues={":u": user_id})
    return sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)


@router.get("/{payment_id}")
def get_payment(payment_id: str):
    resp = tbl.get_item(Key={"id": payment_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Payment not found")
    return item


app.include_router(router)
