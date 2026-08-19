"""Transactions microservice.

Balances still live in DynamoDB (accounts table, updated atomically).
Transaction *history* now lives in S3, written and read through the
transactions-history Lambda behind API Gateway (see terraform/lambda.tf +
terraform/s3.tf) instead of a DynamoDB table - this service just calls
that HTTP API.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal, List

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from botocore.exceptions import ClientError

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table

app = FastAPI(title="VeeraBank Transactions Service", version="1.0.0")
accounts_table = table("accounts")

# Base URL of the transactions-history API Gateway stage, e.g.
# https://abc123.execute-api.us-east-1.amazonaws.com
HISTORY_API_URL = os.environ.get("TRANSACTIONS_HISTORY_API_URL", "").rstrip("/")


class TransactionCreate(BaseModel):
    account_id: str
    type: Literal["deposit", "withdrawal"]
    amount: Decimal = Field(gt=0)


class Transaction(BaseModel):
    account_id: str
    transaction_id: str
    type: str
    amount: Decimal
    balance_after: Decimal
    created_at: str


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"service": "transactions-service", "status": "running"}


def _write_history(txn_item: dict):
    if not HISTORY_API_URL:
        print("[transactions] TRANSACTIONS_HISTORY_API_URL not set, skipping S3 history write")
        return
    # Decimal isn't JSON-serializable - amount/balance_after are strings on
    # the wire and get cast back to Decimal by the Transaction response model.
    json_safe = {**txn_item, "amount": str(txn_item["amount"]), "balance_after": str(txn_item["balance_after"])}
    resp = requests.post(f"{HISTORY_API_URL}/history", json=json_safe, timeout=5)
    resp.raise_for_status()


def _read_history(account_id: str) -> list:
    if not HISTORY_API_URL:
        return []
    resp = requests.get(f"{HISTORY_API_URL}/history/{account_id}", timeout=5)
    resp.raise_for_status()
    return resp.json()


@app.post("/transactions", response_model=Transaction, status_code=201)
def create_transaction(payload: TransactionCreate):
    delta = payload.amount if payload.type == "deposit" else -payload.amount

    try:
        if payload.type == "withdrawal":
            # Conditional update prevents overdraft atomically -
            # no read-then-write race condition.
            update_resp = accounts_table.update_item(
                Key={"account_id": payload.account_id},
                UpdateExpression="SET balance = balance + :delta",
                ConditionExpression="attribute_exists(account_id) AND balance >= :amount",
                ExpressionAttributeValues={":delta": delta, ":amount": payload.amount},
                ReturnValues="UPDATED_NEW",
            )
        else:
            update_resp = accounts_table.update_item(
                Key={"account_id": payload.account_id},
                UpdateExpression="SET balance = balance + :delta",
                ConditionExpression="attribute_exists(account_id)",
                ExpressionAttributeValues={":delta": delta},
                ReturnValues="UPDATED_NEW",
            )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise HTTPException(
                status_code=400,
                detail="Account not found or insufficient balance",
            )
        raise

    new_balance = update_resp["Attributes"]["balance"]

    txn_item = {
        "account_id": payload.account_id,
        "transaction_id": str(uuid.uuid4()),
        "type": payload.type,
        "amount": payload.amount,
        "balance_after": new_balance,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_history(txn_item)
    return txn_item


@app.get("/transactions/{account_id}", response_model=List[Transaction])
def list_transactions(account_id: str):
    return _read_history(account_id)
