"""Notifications microservice - reads what notification-writer Lambda
writes (see backend/lambdas/notification_writer), plus mark-as-read."""
import os
import sys
from typing import List

from fastapi import APIRouter, FastAPI, HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table

app = FastAPI(title="VeeraBank Notifications Service", version="2.0.0")
router = APIRouter(prefix="/notifications")
tbl = table("notifications")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "notifications-service", "status": "running"}


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    resp = tbl.query(IndexName="user_id-index", KeyConditionExpression="user_id = :u", ExpressionAttributeValues={":u": user_id})
    return sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)


@router.get("/{notification_id}")
def get_notification(notification_id: str):
    resp = tbl.get_item(Key={"id": notification_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Notification not found")
    return item


@router.patch("/{notification_id}/read")
def mark_read(notification_id: str):
    resp = tbl.get_item(Key={"id": notification_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Notification not found")
    tbl.update_item(Key={"id": notification_id}, UpdateExpression="SET #r = :r", ExpressionAttributeNames={"#r": "read"}, ExpressionAttributeValues={":r": True})
    return {**item, "read": True}


@router.delete("/{notification_id}", status_code=204)
def delete_notification(notification_id: str):
    resp = tbl.get_item(Key={"id": notification_id})
    if not resp.get("Item"):
        raise HTTPException(status_code=404, detail="Notification not found")
    tbl.delete_item(Key={"id": notification_id})


app.include_router(router)
