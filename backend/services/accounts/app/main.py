"""Accounts microservice - one real bank account per registered user.

Design rules this service enforces:
  * An account can only be opened for a user_id that already exists in
    the users-service (looked up over HTTP at creation time) - you can't
    open an account for someone who never registered.
  * Exactly ONE account per user_id, forever (VeeraBank is a
    single-account bank). This is enforced atomically with a
    TransactWriteItems call that writes a per-user "lock" item and the
    account item together, so two simultaneous requests for the same
    user can't both succeed (a plain "query then put" would race).
  * owner_name on the account is always the user's registered full_name,
    fetched fresh from users-service - never trusted from the caller -
    so the name on the account can never drift from the one name a
    person registered with.
  * balance lives here and is only ever mutated by the transfers-service
    via its own atomic transaction; this service's own writes never
    touch balance after creation.
"""
import os
import random
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Literal, Optional

import requests
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import dynamodb_client, raw_table_name, table, to_ddb_item
from common.service_base import write_audit_log

app = FastAPI(title="VeeraBank Accounts Service", version="2.0.0")
accounts_table = table("accounts")

# Static in-cluster DNS name of the users-service (ClusterIP Service, see
# k8s/services/users-service.yaml) - same namespace, so no templating
# needed at deploy time, unlike the SNS/API-Gateway ARNs and URLs.
USERS_SERVICE_URL = os.environ.get(
    "USERS_SERVICE_URL", "http://users-svc.veerabank.svc.cluster.local"
).rstrip("/")

RECORD_TYPE_ACCOUNT = "account"
RECORD_TYPE_LOCK = "user_account_lock"


class AccountCreate(BaseModel):
    user_id: str
    account_type: Literal["savings", "current"] = "savings"
    opening_balance: Decimal = Decimal("0")


class Account(BaseModel):
    account_id: str
    account_number: str
    user_id: str
    owner_name: str
    account_type: str
    balance: Decimal
    currency: str = "INR"
    status: str = "active"
    created_at: str


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


def _generate_account_number() -> str:
    """A realistic-looking 12-digit account number with a Luhn check
    digit, e.g. 4821904733X. Random-space collisions are astronomically
    unlikely at this scale for a demo bank, so no uniqueness check."""
    body = "".join(str(random.randint(0, 9)) for _ in range(11))
    return body + _luhn_check_digit(body)


def _fetch_user(user_id: str) -> dict:
    try:
        resp = requests.get(f"{USERS_SERVICE_URL}/users/{user_id}", timeout=5)
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail=f"users-service unreachable: {exc}")
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="No registered user with that user_id - register first")
    resp.raise_for_status()
    return resp.json()


def _to_account_model(item: dict) -> dict:
    return {
        "account_id": item["account_id"],
        "account_number": item["account_number"],
        "user_id": item["user_id"],
        "owner_name": item["owner_name"],
        "account_type": item["account_type"],
        "balance": item["balance"],
        "currency": item.get("currency", "INR"),
        "status": item.get("status", "active"),
        "created_at": item["created_at"],
    }


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"service": "accounts-service", "status": "running"}


@app.post("/accounts", response_model=Account, status_code=201)
def create_account(payload: AccountCreate):
    if payload.opening_balance < 0:
        raise HTTPException(status_code=400, detail="opening_balance cannot be negative")

    # 1. The account can only be opened for a real, already-registered user.
    user = _fetch_user(payload.user_id)

    # 2. Enforce "exactly one account per user" atomically. The lock item's
    #    key is derived deterministically from user_id, so two concurrent
    #    requests racing to create an account for the same user_id will
    #    have exactly one of their two lock-item Puts succeed - DynamoDB
    #    transactions guarantee that.
    account_id = str(uuid.uuid4())
    lock_key = f"LOCK#{payload.user_id}"
    now = datetime.now(timezone.utc).isoformat()

    account_item = {
        "account_id": account_id,
        "record_type": RECORD_TYPE_ACCOUNT,
        "user_id": payload.user_id,
        "account_number": _generate_account_number(),
        "owner_name": user["full_name"],
        "account_type": payload.account_type,
        "balance": payload.opening_balance,
        "currency": "INR",
        "status": "active",
        "created_at": now,
    }
    lock_item = {
        "account_id": lock_key,
        "record_type": RECORD_TYPE_LOCK,
        "user_id": payload.user_id,
        "linked_account_id": account_id,
        "created_at": now,
    }

    client = dynamodb_client()
    table_name = raw_table_name("accounts")
    try:
        client.transact_write_items(
            TransactItems=[
                {
                    "Put": {
                        "TableName": table_name,
                        "Item": to_ddb_item(lock_item),
                        "ConditionExpression": "attribute_not_exists(account_id)",
                    }
                },
                {
                    "Put": {
                        "TableName": table_name,
                        "Item": to_ddb_item(account_item),
                        "ConditionExpression": "attribute_not_exists(account_id)",
                    }
                },
            ]
        )
    except client.exceptions.TransactionCanceledException:
        raise HTTPException(
            status_code=409,
            detail="This user already has an account - VeeraBank allows exactly one account per person.",
        )

    write_audit_log(payload.user_id, "account_opened", {"account_id": account_id, "account_type": payload.account_type})
    return _to_account_model(account_item)


@app.get("/accounts/{account_id}", response_model=Account)
def get_account(account_id: str):
    resp = accounts_table.get_item(Key={"account_id": account_id})
    item = resp.get("Item")
    if not item or item.get("record_type") != RECORD_TYPE_ACCOUNT:
        raise HTTPException(status_code=404, detail="Account not found")
    return _to_account_model(item)


@app.get("/accounts/by-user/{user_id}", response_model=Account)
def get_account_by_user(user_id: str):
    resp = accounts_table.query(
        IndexName="user_id-index",
        KeyConditionExpression="user_id = :u",
        ExpressionAttributeValues={":u": user_id},
    )
    for item in resp.get("Items", []):
        if item.get("record_type") == RECORD_TYPE_ACCOUNT:
            return _to_account_model(item)
    raise HTTPException(status_code=404, detail="This user has not opened an account yet")


@app.get("/accounts/by-number/{account_number}", response_model=Account)
def get_account_by_number(account_number: str):
    """Looks a single account up by its public account number - what a
    real sender would type in to send money to someone else, instead of
    the internal account_id (which is only ever shown to the account's
    own owner)."""
    resp = accounts_table.query(
        IndexName="account_number-index",
        KeyConditionExpression="account_number = :n",
        ExpressionAttributeValues={":n": account_number},
        Limit=1,
    )
    items = [i for i in resp.get("Items", []) if i.get("record_type") == RECORD_TYPE_ACCOUNT]
    if not items:
        raise HTTPException(status_code=404, detail="No account with that account number")
    return _to_account_model(items[0])


@app.get("/accounts", response_model=List[Account])
def list_accounts():
    resp = accounts_table.scan()
    items = resp.get("Items", [])
    while "LastEvaluatedKey" in resp:
        resp = accounts_table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return [_to_account_model(i) for i in items if i.get("record_type") == RECORD_TYPE_ACCOUNT]


@app.delete("/accounts/{account_id}", status_code=204)
def delete_account(account_id: str):
    """Closes the account and releases the user's one-account slot (via
    an atomic transaction that removes both the account and its lock
    item), so they could open a fresh account afterwards if needed."""
    resp = accounts_table.get_item(Key={"account_id": account_id})
    item = resp.get("Item")
    if not item or item.get("record_type") != RECORD_TYPE_ACCOUNT:
        raise HTTPException(status_code=404, detail="Account not found")

    client = dynamodb_client()
    table_name = raw_table_name("accounts")
    lock_key = f"LOCK#{item['user_id']}"
    try:
        client.transact_write_items(
            TransactItems=[
                {
                    "Delete": {
                        "TableName": table_name,
                        "Key": to_ddb_item({"account_id": account_id}),
                        "ConditionExpression": "attribute_exists(account_id)",
                    }
                },
                {
                    "Delete": {
                        "TableName": table_name,
                        "Key": to_ddb_item({"account_id": lock_key}),
                    }
                },
            ]
        )
    except client.exceptions.TransactionCanceledException:
        raise HTTPException(status_code=404, detail="Account not found")
