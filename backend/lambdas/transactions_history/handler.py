"""
user-history Lambda (originally transactions-only, now general-purpose)
-------------------------------------------------------------------------
Sits behind API Gateway (HTTP API) and is the *only* thing that touches the
history S3 bucket. Any backend microservice can call this over HTTPS
instead of writing/reading DynamoDB directly, tagging each write with an
event_type (e.g. "transaction", "transfer", "card_issued", "loan_applied",
"account_opened", ...). Every event for a given user lands under that
user's own S3 folder, so GET returns their whole combined activity
history, newest first, regardless of which service wrote each entry.

Routes (API Gateway payload format 2.0):
  POST /history            body: {user_id (or account_id), event_type,
                                   event_id (optional), created_at
                                   (optional), ...arbitrary event fields}
       -> writes s3://<bucket>/<user_id>/<event_type>-<event_id>.json

  GET  /history/{user_id}
       -> lists + reads every object under <user_id>/ and returns them
          newest-first as a JSON array (mixed event types combined)
"""
import json
import os
import uuid
from datetime import datetime, timezone

import boto3

s3 = boto3.client("s3")
BUCKET = os.environ["TRANSACTION_HISTORY_BUCKET"]


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body, default=str),
    }


def _write_event(body: dict):
    # Back-compat: the transactions-service still sends account_id /
    # transaction_id / type - treat those the same as user_id / event_id /
    # event_type so it keeps working unmodified.
    user_id = body.get("user_id") or body.get("account_id")
    if not user_id:
        return _response(400, {"error": "body must include user_id (or account_id)"})

    event_type = body.get("event_type") or body.get("type") or "event"
    event_id = body.get("event_id") or body.get("transaction_id") or str(uuid.uuid4())

    item = {
        **body,
        "user_id": user_id,
        "event_type": event_type,
        "event_id": event_id,
    }
    item.setdefault("created_at", datetime.now(timezone.utc).isoformat())

    key = f"{user_id}/{event_type}-{event_id}.json"
    s3.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=json.dumps(item, default=str).encode("utf-8"),
        ContentType="application/json",
    )
    return _response(201, item)


def _list_events(user_id: str):
    prefix = f"{user_id}/"
    items = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            resp = s3.get_object(Bucket=BUCKET, Key=obj["Key"])
            items.append(json.loads(resp["Body"].read()))

    items.sort(key=lambda e: e.get("created_at", ""), reverse=True)
    return _response(200, items)


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("rawPath", "/")

    try:
        if method == "POST" and path.rstrip("/") == "/history":
            body = json.loads(event.get("body") or "{}")
            return _write_event(body)

        if method == "GET" and path.startswith("/history/"):
            user_id = event["pathParameters"]["account_id"]
            return _list_events(user_id)

        return _response(404, {"error": "no matching route"})
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as 500
        return _response(500, {"error": str(exc)})
