"""Fraud Detection microservice - staff-facing view of flags raised by
other services (transfers-service auto-flags any transfer over
FRAUD_FLAG_THRESHOLD - see backend/services/transfers). Not a generic
CRUD store: entries only ever come from a real rule firing elsewhere,
staff can only review/clear them here."""
import os
import sys
from typing import List

from fastapi import APIRouter, FastAPI, HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table
from common.service_base import now_iso

app = FastAPI(title="VeeraBank Fraud Detection Service", version="2.0.0")
router = APIRouter(prefix="/fraud-detection")
tbl = table("fraud-detection")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "fraud-detection-service", "status": "running"}


@router.get("/flags", response_model=List[dict])
def list_flags(open_only: bool = False):
    resp = tbl.scan()
    items = resp.get("Items", [])
    if open_only:
        items = [i for i in items if i.get("status") == "open"]
    return sorted(items, key=lambda i: i.get("created_at", ""), reverse=True)


@router.get("/flags/{flag_id}")
def get_flag(flag_id: str):
    resp = tbl.get_item(Key={"id": flag_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Flag not found")
    return item


@router.patch("/flags/{flag_id}/clear")
def clear_flag(flag_id: str):
    resp = tbl.get_item(Key={"id": flag_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Flag not found")
    tbl.update_item(Key={"id": flag_id}, UpdateExpression="SET #s = :s, cleared_at = :c", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "cleared", ":c": now_iso()})
    return {**item, "status": "cleared"}


app.include_router(router)
