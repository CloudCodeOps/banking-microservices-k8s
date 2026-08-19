"""Disputes microservice - raise a dispute against a real transfer id
(verified against transfers-service's own table) and track it through
resolution."""
import os
import sys
from typing import List, Optional

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table
from common.service_base import new_id, now_iso, write_audit_log

app = FastAPI(title="VeeraBank Disputes Service", version="2.0.0")
router = APIRouter(prefix="/disputes")
tbl = table("disputes")
transfers_table = table("transfers")


class DisputeCreate(BaseModel):
    user_id: str
    transfer_id: str
    reason: str


class DisputeResolution(BaseModel):
    resolution_note: str


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "disputes-service", "status": "running"}


@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def raise_dispute(payload: DisputeCreate):
    resp = transfers_table.get_item(Key={"id": payload.transfer_id})
    transfer = resp.get("Item")
    if not transfer:
        raise HTTPException(status_code=404, detail="No transfer with that id")
    if payload.user_id not in (transfer["from_user_id"], transfer["to_user_id"]):
        raise HTTPException(status_code=403, detail="You can only dispute a transfer you were party to")

    item = {
        "id": new_id(),
        "user_id": payload.user_id,
        "transfer_id": payload.transfer_id,
        "reason": payload.reason,
        "status": "open",
        "created_at": now_iso(),
    }
    tbl.put_item(Item=item)
    write_audit_log(payload.user_id, "dispute_raised", {"dispute_id": item["id"], "transfer_id": payload.transfer_id})
    return item


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    resp = tbl.query(IndexName="user_id-index", KeyConditionExpression="user_id = :u", ExpressionAttributeValues={":u": user_id})
    return sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)


@router.get("/open", response_model=List[dict])
def list_open():
    resp = tbl.scan(FilterExpression="#s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "open"})
    return resp.get("Items", [])


@router.get("/{dispute_id}")
def get_dispute(dispute_id: str):
    resp = tbl.get_item(Key={"id": dispute_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Dispute not found")
    return item


@router.patch("/{dispute_id}/resolve")
def resolve(dispute_id: str, payload: DisputeResolution):
    resp = tbl.get_item(Key={"id": dispute_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Dispute not found")
    tbl.update_item(
        Key={"id": dispute_id},
        UpdateExpression="SET #s = :s, resolution_note = :r",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": "resolved", ":r": payload.resolution_note},
    )
    return {**item, "status": "resolved", "resolution_note": payload.resolution_note}


app.include_router(router)
