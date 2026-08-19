"""Statements microservice - a real account statement, computed on the
fly from transfers-service's own ledger (no separate copy of the data
to keep in sync) plus this account's current balance."""
import os
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import FastAPI, HTTPException, Query

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table
from common.service_base import get_account_or_404

app = FastAPI(title="VeeraBank Statements Service", version="2.0.0")
transfers_table = table("transfers")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/statements/{account_id}")
def statement(
    account_id: str,
    from_date: Optional[str] = Query(None, description="ISO date, inclusive"),
    to_date: Optional[str] = Query(None, description="ISO date, inclusive"),
):
    account = get_account_or_404(account_id)

    sent = transfers_table.query(IndexName="from_account_id-index", KeyConditionExpression="from_account_id = :a", ExpressionAttributeValues={":a": account_id}).get("Items", [])
    received = transfers_table.query(IndexName="to_account_id-index", KeyConditionExpression="to_account_id = :a", ExpressionAttributeValues={":a": account_id}).get("Items", [])

    lines = []
    for t in sent:
        lines.append({"date": t["created_at"], "description": f"Transfer out{(' - ' + t['note']) if t.get('note') else ''}", "amount": -Decimal(t["amount"]), "transfer_id": t["id"]})
    for t in received:
        lines.append({"date": t["created_at"], "description": f"Transfer in{(' - ' + t['note']) if t.get('note') else ''}", "amount": Decimal(t["amount"]), "transfer_id": t["id"]})

    # A plain "YYYY-MM-DD" date filters by day; anything longer (e.g. a
    # full ISO timestamp from a "last N minutes" quick-period button) is
    # compared against the full created_at timestamp instead, so short
    # windows like "last 5 minutes" actually narrow results down.
    if from_date:
        lines = [l for l in lines if (l["date"][:10] if len(from_date) <= 10 else l["date"]) >= from_date]
    if to_date:
        lines = [l for l in lines if (l["date"][:10] if len(to_date) <= 10 else l["date"]) <= to_date]

    lines.sort(key=lambda l: l["date"])
    total_in = sum((l["amount"] for l in lines if l["amount"] > 0), Decimal(0))
    total_out = sum((-l["amount"] for l in lines if l["amount"] < 0), Decimal(0))

    return {
        "account_id": account_id,
        "account_number": account["account_number"],
        "owner_name": account["owner_name"],
        "current_balance": account["balance"],
        "period": {"from": from_date, "to": to_date},
        "total_credits": total_in,
        "total_debits": total_out,
        "line_count": len(lines),
        "lines": lines,
    }
