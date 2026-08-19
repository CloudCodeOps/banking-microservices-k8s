"""KYC microservice - identity verification workflow (submit -> verify/reject)."""
import os
import sys
from typing import List, Optional

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table
from common.service_base import new_id, now_iso, write_audit_log

app = FastAPI(title="VeeraBank KYC Service", version="2.0.0")
router = APIRouter(prefix="/kyc")
tbl = table("kyc")


class KycSubmit(BaseModel):
    user_id: str
    document_type: str  # e.g. "passport", "national_id", "drivers_license"
    document_number: str


class KycReject(BaseModel):
    reason: str = "Documents did not pass verification"


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "kyc-service", "status": "running"}


@router.post("/submit", status_code=201)
def submit(payload: KycSubmit):
    item = {
        "id": new_id(),
        "user_id": payload.user_id,
        "document_type": payload.document_type,
        "document_number": payload.document_number,
        "status": "pending",
        "created_at": now_iso(),
    }
    tbl.put_item(Item=item)
    write_audit_log(payload.user_id, "kyc_submitted", {"kyc_id": item["id"], "document_type": payload.document_type})
    return item


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    resp = tbl.query(IndexName="user_id-index", KeyConditionExpression="user_id = :u", ExpressionAttributeValues={":u": user_id})
    return sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)


@router.get("/pending", response_model=List[dict])
def list_pending():
    resp = tbl.scan(FilterExpression="#s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "pending"})
    return resp.get("Items", [])


@router.get("/{kyc_id}")
def get_kyc(kyc_id: str):
    resp = tbl.get_item(Key={"id": kyc_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="KYC submission not found")
    return item


@router.patch("/{kyc_id}/verify")
def verify(kyc_id: str):
    resp = tbl.get_item(Key={"id": kyc_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="KYC submission not found")
    tbl.update_item(Key={"id": kyc_id}, UpdateExpression="SET #s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "verified"})
    write_audit_log(item["user_id"], "kyc_verified", {"kyc_id": kyc_id})
    return {**item, "status": "verified"}


@router.patch("/{kyc_id}/reject")
def reject(kyc_id: str, payload: KycReject):
    resp = tbl.get_item(Key={"id": kyc_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="KYC submission not found")
    tbl.update_item(Key={"id": kyc_id}, UpdateExpression="SET #s = :s, reason = :r", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "rejected", ":r": payload.reason})
    return {**item, "status": "rejected", "reason": payload.reason}


app.include_router(router)
