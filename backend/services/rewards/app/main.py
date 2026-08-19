"""Rewards microservice - a real points ledger (earn/redeem entries),
balance computed as the running sum, not a single mutable counter (so
the full history is always auditable)."""
import os
import sys
from decimal import Decimal
from typing import List

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, field_validator

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table
from common.service_base import new_id, now_iso

app = FastAPI(title="VeeraBank Rewards Service", version="2.0.0")
router = APIRouter(prefix="/rewards")
tbl = table("rewards")


class RedeemRequest(BaseModel):
    user_id: str
    points: int
    description: str = "Reward redemption"

    @field_validator("points")
    @classmethod
    def _positive(cls, v):
        if v <= 0:
            raise ValueError("points must be greater than zero")
        return v


def _entries_for_user(user_id: str) -> list:
    resp = tbl.query(IndexName="user_id-index", KeyConditionExpression="user_id = :u", ExpressionAttributeValues={":u": user_id})
    return resp.get("Items", [])


def award_points(user_id: str, points: int, reason: str) -> dict:
    """Called internally (e.g. by transfers-service) to earn points -
    not exposed to end users directly, they only earn by banking."""
    item = {
        "id": new_id(),
        "user_id": user_id,
        "kind": "earn",
        "points": points,
        "description": reason,
        "created_at": now_iso(),
    }
    tbl.put_item(Item=item)
    return item


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "rewards-service", "status": "running"}


@router.get("/user/{user_id}/balance")
def balance(user_id: str):
    entries = _entries_for_user(user_id)
    total = sum((e["points"] if e["kind"] == "earn" else -e["points"]) for e in entries)
    return {"user_id": user_id, "points_balance": total}


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    return sorted(_entries_for_user(user_id), key=lambda i: i.get("created_at", ""), reverse=True)


@router.post("/redeem", status_code=201)
def redeem(payload: RedeemRequest):
    entries = _entries_for_user(payload.user_id)
    total = sum((e["points"] if e["kind"] == "earn" else -e["points"]) for e in entries)
    if payload.points > total:
        raise HTTPException(status_code=400, detail=f"Not enough points - you have {total}")

    item = {
        "id": new_id(),
        "user_id": payload.user_id,
        "kind": "redeem",
        "points": payload.points,
        "description": payload.description,
        "created_at": now_iso(),
    }
    tbl.put_item(Item=item)
    return item


app.include_router(router)
