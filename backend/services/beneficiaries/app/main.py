"""Beneficiaries microservice - a user's saved payees for quick transfers
later. Verifies the account number is real (looked up in accounts-
service's own table) before saving it, instead of accepting any string."""
import os
import sys
from typing import List, Optional

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table
from common.service_base import new_id, now_iso

app = FastAPI(title="VeeraBank Beneficiaries Service", version="2.0.0")
router = APIRouter(prefix="/beneficiaries")
tbl = table("beneficiaries")
accounts_table = table("accounts")


class BeneficiaryCreate(BaseModel):
    user_id: str
    account_number: str
    nickname: Optional[str] = None


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "beneficiaries-service", "status": "running"}


@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def add_beneficiary(payload: BeneficiaryCreate):
    resp = accounts_table.scan(
        FilterExpression="account_number = :n AND record_type = :t",
        ExpressionAttributeValues={":n": payload.account_number, ":t": "account"},
        Limit=1,
    )
    matches = resp.get("Items", [])
    if not matches:
        raise HTTPException(status_code=404, detail="No VeeraBank account with that account number")
    target = matches[0]
    if target["user_id"] == payload.user_id:
        raise HTTPException(status_code=400, detail="You can't add yourself as a beneficiary")

    item = {
        "id": new_id(),
        "user_id": payload.user_id,
        "account_number": payload.account_number,
        "beneficiary_name": target["owner_name"],
        "nickname": payload.nickname or target["owner_name"],
        "created_at": now_iso(),
    }
    tbl.put_item(Item=item)
    return item


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    resp = tbl.query(IndexName="user_id-index", KeyConditionExpression="user_id = :u", ExpressionAttributeValues={":u": user_id})
    return sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)


@router.delete("/{beneficiary_id}", status_code=204)
def remove_beneficiary(beneficiary_id: str):
    resp = tbl.get_item(Key={"id": beneficiary_id})
    if not resp.get("Item"):
        raise HTTPException(status_code=404, detail="Beneficiary not found")
    tbl.delete_item(Key={"id": beneficiary_id})


app.include_router(router)
