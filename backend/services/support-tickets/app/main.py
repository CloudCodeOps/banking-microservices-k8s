"""Support Tickets microservice - a real support inbox: raise a ticket,
staff reply, either side can close it."""
import os
import sys
from typing import List

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table
from common.service_base import new_id, now_iso

app = FastAPI(title="VeeraBank Support Tickets Service", version="2.0.0")
router = APIRouter(prefix="/support-tickets")
tbl = table("support-tickets")


class TicketCreate(BaseModel):
    user_id: str
    subject: str
    message: str


class TicketReply(BaseModel):
    message: str
    from_staff: bool = True


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "support-tickets-service", "status": "running"}


@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def create_ticket(payload: TicketCreate):
    now = now_iso()
    item = {
        "id": new_id(),
        "user_id": payload.user_id,
        "subject": payload.subject,
        "status": "open",
        "created_at": now,
        "messages": [{"from_staff": False, "message": payload.message, "at": now}],
    }
    tbl.put_item(Item=item)
    return item


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    resp = tbl.query(IndexName="user_id-index", KeyConditionExpression="user_id = :u", ExpressionAttributeValues={":u": user_id})
    return sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)


@router.get("/open", response_model=List[dict])
def list_open():
    resp = tbl.scan(FilterExpression="#s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "open"})
    return sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str):
    resp = tbl.get_item(Key={"id": ticket_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return item


@router.post("/{ticket_id}/reply")
def reply(ticket_id: str, payload: TicketReply):
    resp = tbl.get_item(Key={"id": ticket_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Ticket not found")
    messages = item.get("messages", [])
    messages.append({"from_staff": payload.from_staff, "message": payload.message, "at": now_iso()})
    tbl.update_item(Key={"id": ticket_id}, UpdateExpression="SET messages = :m", ExpressionAttributeValues={":m": messages})
    return {**item, "messages": messages}


@router.patch("/{ticket_id}/close")
def close(ticket_id: str):
    resp = tbl.get_item(Key={"id": ticket_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Ticket not found")
    tbl.update_item(Key={"id": ticket_id}, UpdateExpression="SET #s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "closed"})
    return {**item, "status": "closed"}


app.include_router(router)
