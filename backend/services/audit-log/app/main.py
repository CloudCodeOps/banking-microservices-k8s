"""Audit Log microservice - a real, append-only trail of security-
relevant actions across the bank (account opened, transfer sent, loan
disbursed, KYC verified, ...), written by other services via
common.service_base.write_audit_log(). Read-only from here: nothing
in this bank writes its own audit trail through an HTTP call, entries
are always a side effect of a real action elsewhere."""
import os
import sys
from typing import List, Optional

from fastapi import APIRouter, FastAPI, HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table

app = FastAPI(title="VeeraBank Audit Log Service", version="2.0.0")
router = APIRouter(prefix="/audit-log")
tbl = table("audit-log")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "audit-log-service", "status": "running"}


@router.get("/all", response_model=List[dict])
def list_all(limit: int = 200):
    resp = tbl.scan()
    items = resp.get("Items", [])
    while "LastEvaluatedKey" in resp and len(items) < limit:
        resp = tbl.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return sorted(items, key=lambda i: i.get("created_at", ""), reverse=True)[:limit]


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    # No GSI on this staff-facing table (bank-wide, not per-user scale) -
    # a filtered scan is fine at this table's size.
    resp = tbl.scan(FilterExpression="user_id = :u", ExpressionAttributeValues={":u": user_id})
    return sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)


@router.get("/{entry_id}")
def get_entry(entry_id: str):
    resp = tbl.get_item(Key={"id": entry_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Audit entry not found")
    return item


app.include_router(router)
