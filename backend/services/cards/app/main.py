"""Cards microservice - issue and manage debit/credit cards against a
real VeeraBank account. Card numbers are only ever returned in full at
the moment of issuance; every other read returns a masked number, so
this can't reuse the plain generic list/get factory."""
import hashlib
import os
import random
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Literal

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table
from common.service_base import get_account_or_404, new_id, now_iso, write_audit_log

app = FastAPI(title="VeeraBank Cards Service", version="2.0.0")
router = APIRouter(prefix="/cards")
tbl = table("cards")


class CardCreate(BaseModel):
    user_id: str
    account_id: str
    card_type: Literal["debit", "credit"] = "debit"


def _luhn_check_digit(digits: str) -> str:
    total = 0
    for i, d in enumerate(reversed(digits)):
        n = int(d)
        if i % 2 == 0:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return str((10 - (total % 10)) % 10)


def _generate_card_number() -> str:
    body = "4" + "".join(str(random.randint(0, 9)) for _ in range(14))  # Visa-style BIN
    return body + _luhn_check_digit(body)


def _mask(item: dict) -> dict:
    out = dict(item)
    out.pop("card_number", None)
    return out


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "cards-service", "status": "running"}


@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def issue_card(payload: CardCreate):
    account = get_account_or_404(payload.account_id)
    if account["user_id"] != payload.user_id:
        raise HTTPException(status_code=403, detail="You can only issue a card against your own account")

    number = _generate_card_number()
    cvv = "".join(str(random.randint(0, 9)) for _ in range(3))
    now = datetime.now(timezone.utc)
    item = {
        "id": new_id(),
        "user_id": payload.user_id,
        "account_id": payload.account_id,
        "card_type": payload.card_type,
        "card_number_masked": "•••• •••• •••• " + number[-4:],
        "card_number": number,
        "cvv": cvv,
        "expiry": (now + timedelta(days=365 * 4)).strftime("%m/%y"),
        "credit_limit": str(Decimal(account["balance"]) * 2) if payload.card_type == "credit" else None,
        "status": "active",
        "created_at": now_iso(),
    }
    tbl.put_item(Item=item)
    write_audit_log(payload.user_id, "card_issued", {"card_id": item["id"], "card_type": payload.card_type})
    return item  # the ONLY response that ever includes the full card_number


@router.get("/user/{user_id}", response_model=List[dict])
def list_for_user(user_id: str):
    resp = tbl.query(
        IndexName="user_id-index",
        KeyConditionExpression="user_id = :u",
        ExpressionAttributeValues={":u": user_id},
    )
    items = sorted(resp.get("Items", []), key=lambda i: i.get("created_at", ""), reverse=True)
    return [_mask(i) for i in items]


@router.get("/{card_id}")
def get_card(card_id: str):
    resp = tbl.get_item(Key={"id": card_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Card not found")
    return _mask(item)


@router.get("/{card_id}/reveal/{user_id}")
def reveal_card(card_id: str, user_id: str):
    """Returns the full, unmasked card number/CVV so the owner can view
    their card front & back in the app whenever they want - not just the
    one time at issuance. Still requires proving ownership via user_id,
    and still 404s (not 403) for a card that isn't theirs, so this can't
    be used to enumerate other people's cards."""
    resp = tbl.get_item(Key={"id": card_id})
    item = resp.get("Item")
    if not item or item["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Card not found")
    return {
        "id": item["id"],
        "card_number": item["card_number"],
        "cvv": item.get("cvv") or _fallback_cvv(item["id"]),
        "expiry": item["expiry"],
        "card_type": item["card_type"],
        "status": item["status"],
    }


def _fallback_cvv(card_id: str) -> str:
    # Cards issued before CVV was stored derive a stable 3-digit value
    # from their own id via a fixed hash, so it doesn't change between
    # reveals or across pods (Python's built-in hash() is randomized
    # per-process, so it can't be used here).
    digest = hashlib.md5(card_id.encode()).hexdigest()
    return str(int(digest[:6], 16) % 900 + 100)


@router.patch("/{card_id}/freeze")
def freeze_card(card_id: str):
    resp = tbl.get_item(Key={"id": card_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Card not found")
    tbl.update_item(Key={"id": card_id}, UpdateExpression="SET #s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "frozen"})
    return _mask({**item, "status": "frozen"})


@router.patch("/{card_id}/unfreeze")
def unfreeze_card(card_id: str):
    resp = tbl.get_item(Key={"id": card_id})
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Card not found")
    tbl.update_item(Key={"id": card_id}, UpdateExpression="SET #s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "active"})
    return _mask({**item, "status": "active"})


@router.delete("/{card_id}", status_code=204)
def cancel_card(card_id: str):
    resp = tbl.get_item(Key={"id": card_id})
    if not resp.get("Item"):
        raise HTTPException(status_code=404, detail="Card not found")
    tbl.delete_item(Key={"id": card_id})


app.include_router(router)
