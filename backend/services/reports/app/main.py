"""Reports microservice - bank-wide analytics computed on the fly from
the real accounts and transfers tables (staff-facing, read-only)."""
import os
import sys
from decimal import Decimal

from fastapi import FastAPI

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table

app = FastAPI(title="VeeraBank Reports Service", version="2.0.0")
accounts_table = table("accounts")
transfers_table = table("transfers")


def _scan_all(tbl):
    resp = tbl.scan()
    items = resp.get("Items", [])
    while "LastEvaluatedKey" in resp:
        resp = tbl.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return items


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/reports/summary")
def summary():
    accounts = [a for a in _scan_all(accounts_table) if a.get("record_type") == "account"]
    transfers = _scan_all(transfers_table)

    total_balance = sum((Decimal(a["balance"]) for a in accounts), Decimal(0))
    total_volume = sum((Decimal(t["amount"]) for t in transfers), Decimal(0))
    by_type: dict = {}
    for a in accounts:
        by_type[a["account_type"]] = by_type.get(a["account_type"], 0) + 1

    return {
        "total_accounts": len(accounts),
        "accounts_by_type": by_type,
        "total_balance_across_bank": total_balance,
        "total_transfers": len(transfers),
        "total_transfer_volume": total_volume,
        "average_transfer_amount": (total_volume / len(transfers)).quantize(Decimal("0.01")) if transfers else Decimal(0),
        "largest_account_balance": max((Decimal(a["balance"]) for a in accounts), default=Decimal(0)),
    }
