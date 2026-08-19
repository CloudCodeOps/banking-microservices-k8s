"""
users-db-sync Lambda
---------------------
DynamoDB Streams (the "users" table) -> this Lambda -> Aurora MySQL "users"
table (see terraform/rds.tf).

DynamoDB is the source of truth for registration/login (the users-service
pod only ever talks to DynamoDB - see backend/services/users/app/main.py).
This Lambda is the *only* thing that writes to the Aurora cluster: it
mirrors every INSERT/MODIFY/REMOVE on the DynamoDB table into RDS so the
same data can also be queried/joined relationally.

Runs inside the VPC (see the users_db_sync_lambda security group in
rds.tf) so it can reach the Aurora cluster on 3306. DB credentials are
pulled from the private S3 bucket written by terraform (DB_CREDS_BUCKET /
DB_CREDS_KEY env vars), same as the old direct-RDS setup used.
"""
import json
import os

import boto3
import pymysql

s3 = boto3.client("s3")

_creds_cache = None
_conn = None
_schema_ready = False


def _get_db_credentials() -> dict:
    global _creds_cache
    if _creds_cache is not None:
        return _creds_cache
    resp = s3.get_object(Bucket=os.environ["DB_CREDS_BUCKET"], Key=os.environ["DB_CREDS_KEY"])
    _creds_cache = json.loads(resp["Body"].read())
    return _creds_cache


def _get_connection():
    """Reuse the connection across warm invocations; reconnect if it died."""
    global _conn
    if _conn is not None:
        try:
            _conn.ping(reconnect=False)
            return _conn
        except Exception:
            _conn = None

    creds = _get_db_credentials()
    _conn = pymysql.connect(
        host=creds["host"],
        port=int(creds.get("port", 3306)),
        user=creds["username"],
        password=creds["password"],
        database=creds["dbname"],
        autocommit=True,
        connect_timeout=5,
    )
    return _conn


def _ensure_schema(conn):
    global _schema_ready
    if _schema_ready:
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id       CHAR(36)     NOT NULL PRIMARY KEY,
                email          VARCHAR(255) NOT NULL UNIQUE,
                full_name      VARCHAR(255) NOT NULL,
                phone          VARCHAR(32)  NOT NULL,
                password_hash VARCHAR(64)  NOT NULL,
                created_at    DATETIME     NOT NULL
            )
            """
        )
    _schema_ready = True


def _plain(dynamo_image: dict) -> dict:
    """Convert a DynamoDB Streams attribute-value image ({"S": "..."} etc.)
    into a plain dict of native values. Only handles the scalar types this
    table actually uses (S)."""
    return {k: next(iter(v.values())) for k, v in dynamo_image.items()}


def handler(event, context):
    conn = _get_connection()
    _ensure_schema(conn)

    with conn.cursor() as cur:
        for record in event.get("Records", []):
            event_name = record.get("eventName")
            dynamo = record.get("dynamodb", {})

            if event_name in ("INSERT", "MODIFY"):
                item = _plain(dynamo.get("NewImage", {}))
                cur.execute(
                    """
                    INSERT INTO users (user_id, email, full_name, phone, password_hash, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        email = VALUES(email),
                        full_name = VALUES(full_name),
                        phone = VALUES(phone),
                        password_hash = VALUES(password_hash)
                    """,
                    (
                        item["user_id"],
                        item["email"],
                        item["full_name"],
                        item["phone"],
                        item["password_hash"],
                        item["created_at"],
                    ),
                )
            elif event_name == "REMOVE":
                old = _plain(dynamo.get("OldImage", {}))
                cur.execute("DELETE FROM users WHERE user_id = %s", (old["user_id"],))

    return {"statusCode": 200, "processed": len(event.get("Records", []))}
