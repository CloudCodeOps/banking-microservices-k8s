"""Admin microservice - the staff console's single overview endpoint,
aggregating the real staff queues from every other service (pending
loans, pending KYC, open tickets, open fraud flags) via direct table
reads (every backend pod shares one IRSA role, see k8s/serviceaccount.yaml,
so this is a normal same-account DynamoDB read, not a security bypass).
Actually approving/rejecting still goes through each service's own
endpoint (loans-service, kyc-service, ...) - this service only reads."""
import os
import sys

from fastapi import FastAPI

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table

app = FastAPI(title="VeeraBank Admin Service", version="2.0.0")


def _count(tbl_name: str, filter_expr=None, values=None) -> int:
    tbl = table(tbl_name)
    kwargs = {}
    if filter_expr:
        kwargs["FilterExpression"] = filter_expr
        kwargs["ExpressionAttributeValues"] = values
    resp = tbl.scan(**kwargs)
    count = len(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = tbl.scan(ExclusiveStartKey=resp["LastEvaluatedKey"], **kwargs)
        count += len(resp.get("Items", []))
    return count


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/admin/overview")
def overview():
    return {
        "total_users": _count("users"),
        "total_accounts": _count("accounts", "record_type = :t", {":t": "account"}),
        "pending_loans": _count_status("loans", "pending_review"),
        "pending_kyc": _count_status("kyc", "pending"),
        "open_tickets": _count_status("support-tickets", "open"),
        "open_fraud_flags": _count_status("fraud-detection", "open"),
        "open_disputes": _count_status("disputes", "open"),
    }


def _count_status(tbl_name: str, status: str) -> int:
    tbl = table(tbl_name)
    resp = tbl.scan(FilterExpression="#s = :s", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": status})
    return len(resp.get("Items", []))
