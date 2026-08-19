"""Users microservice - registration/login + first-time-registration
SNS notification. This is the entry point new customers hit first.

DynamoDB is the source of truth here (this service never talks to RDS
directly). Every write is streamed by the users-db-sync Lambda into an
Aurora MySQL replica for relational querying (see terraform/rds.tf +
backend/lambdas/users_db_sync) - that replication is transparent to this
service.
"""
import hashlib
import os
import random
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from botocore.exceptions import ClientError
from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, EmailStr, Field

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.aws_clients import table, sns_publish
from common.mailer import send_otp_email, send_login_email

app = FastAPI(title="VeeraBank Users Service", version="1.0.0")
router = APIRouter(prefix="/users")

SNS_TOPIC_ENV = "USER_REGISTERED_TOPIC_ARN"

users_table = table("users")
otp_table = table("otp_codes")

OTP_TTL_SECONDS = 5 * 60          # code is valid for 5 minutes
OTP_VERIFIED_TTL_SECONDS = 15 * 60  # verified flag stays good for 15 minutes, long enough to finish signup

# Base URL of the (now general-purpose) history API Gateway stage - same
# one the transactions-service uses. Optional: registration still succeeds
# if it isn't set, it just won't show up in the combined activity history.
HISTORY_API_URL = os.environ.get("TRANSACTIONS_HISTORY_API_URL", "").rstrip("/")


def _hash_password(password: str) -> str:
    salt = os.getenv("PASSWORD_SALT", "veerabank-dev-salt")
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


def _get_by_email(email: str):
    resp = users_table.query(
        IndexName="email-index",
        KeyConditionExpression="email = :e",
        ExpressionAttributeValues={":e": email},
        Limit=1,
    )
    items = resp.get("Items", [])
    return items[0] if items else None


def _write_history_event(user_id: str, event_type: str, details: dict):
    if not HISTORY_API_URL:
        print("[users] TRANSACTIONS_HISTORY_API_URL not set, skipping history write")
        return
    try:
        payload = {"user_id": user_id, "event_type": event_type, **details}
        resp = requests.post(f"{HISTORY_API_URL}/history", json=payload, timeout=5)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001 - history logging must never break registration
        print(f"[users] failed to write history event: {exc}")


class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str


class SendOtpRequest(BaseModel):
    email: EmailStr
    purpose: str = "signup"


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str
    purpose: str = "signup"


class UpdateProfileRequest(BaseModel):
    """Profile self-service is deliberately narrow: a person can change how
    they're displayed (name, photo) but not their email/phone/password
    through this endpoint - those go through their own dedicated flows."""
    full_name: Optional[str] = None
    profile_photo: Optional[str] = Field(None, description="Data URL (base64) of the avatar image")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/")
def root():
    return {"service": "users-service", "status": "running"}


@router.post("/otp/send")
def send_otp(req: SendOtpRequest):
    if req.purpose == "signup" and _get_by_email(req.email):
        raise HTTPException(status_code=409, detail="User already registered")

    code = f"{random.randint(0, 999999):06d}"
    now = int(time.time())
    otp_table.put_item(Item={
        "email": req.email,
        "purpose": req.purpose,
        "code": code,
        "verified": False,
        "created_at": now,
        # DynamoDB TTL attribute - the item auto-expires so codes and stale
        # verified-flags don't pile up (see terraform/dynamodb.tf).
        "expires_at": now + max(OTP_TTL_SECONDS, OTP_VERIFIED_TTL_SECONDS),
        "code_expires_at": now + OTP_TTL_SECONDS,
    })

    sent = send_otp_email(req.email, code, purpose=req.purpose)
    return {"sent": sent, "expires_in": OTP_TTL_SECONDS}


@router.post("/otp/verify")
def verify_otp(req: VerifyOtpRequest):
    resp = otp_table.get_item(Key={"email": req.email})
    item = resp.get("Item")
    if not item or item.get("purpose") != req.purpose:
        raise HTTPException(status_code=400, detail="No code was sent to this email")
    if int(time.time()) > int(item.get("code_expires_at", 0)):
        raise HTTPException(status_code=400, detail="Code expired, request a new one")
    if item.get("code") != req.code.strip():
        raise HTTPException(status_code=400, detail="Incorrect code")

    otp_table.update_item(
        Key={"email": req.email},
        UpdateExpression="SET verified = :v",
        ExpressionAttributeValues={":v": True},
    )
    return {"verified": True}


def _otp_is_verified(email: str, purpose: str = "signup") -> bool:
    resp = otp_table.get_item(Key={"email": email})
    item = resp.get("Item")
    if not item or item.get("purpose") != purpose or not item.get("verified"):
        return False
    return int(time.time()) <= int(item.get("expires_at", 0))


@router.post("/register")
def register(req: RegisterRequest):
    if _get_by_email(req.email):
        raise HTTPException(status_code=409, detail="User already registered")
    if not _otp_is_verified(req.email, "signup"):
        raise HTTPException(status_code=400, detail="Please verify your email with the code we sent before creating an account")

    user_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    item = {
        "user_id": user_id,
        "email": req.email,
        "full_name": req.full_name,
        "phone": req.phone,
        "password_hash": _hash_password(req.password),
        "created_at": created_at,
    }

    try:
        users_table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(user_id)",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise HTTPException(status_code=409, detail="User already registered")
        raise

    try:
        otp_table.delete_item(Key={"email": req.email})
    except Exception as exc:  # noqa: BLE001 - cleanup only, TTL will catch it anyway
        print(f"[users] failed to clean up OTP record: {exc}")

    _write_history_event(
        user_id,
        "account_opened",
        {"full_name": req.full_name, "email": req.email},
    )

    # Structured JSON message: the notification-writer Lambda parses this
    # to both write the in-app notification and send a personal welcome
    # email via SES (see backend/lambdas/notification_writer).
    sns_publish(
        SNS_TOPIC_ENV,
        subject="Welcome to VeeraBank!",
        message={
            "summary": f"New user registered: {req.full_name} ({req.email}, {req.phone}). user_id={user_id}",
            "user_id": user_id,
            "email": req.email,
            "full_name": req.full_name,
            "phone": req.phone,
        },
    )

    return {"user_id": user_id, "email": req.email, "full_name": req.full_name, "profile_photo": None}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
def login(req: LoginRequest):
    user = _get_by_email(req.email)
    if not user or user["password_hash"] != _hash_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    try:
        when_str = datetime.now(timezone.utc).strftime("%b %d, %Y %H:%M UTC")
        send_login_email(user["email"], user["full_name"], when_str)
    except Exception as exc:  # noqa: BLE001 - never fail a login over a notification email
        print(f"[users] failed to send login-notification email: {exc}")

    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "profile_photo": user.get("profile_photo"),
    }


@router.get("/{user_id}")
def get_user(user_id: str):
    resp = users_table.get_item(Key={"user_id": user_id})
    user = resp.get("Item")
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "profile_photo": user.get("profile_photo"),
    }


@router.patch("/{user_id}")
def update_profile(user_id: str, req: UpdateProfileRequest):
    """Self-service profile update - name and/or profile photo only."""
    resp = users_table.get_item(Key={"user_id": user_id})
    user = resp.get("Item")
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    updates = {}
    if req.full_name is not None and req.full_name.strip():
        updates["full_name"] = req.full_name.strip()
    if req.profile_photo is not None:
        updates["profile_photo"] = req.profile_photo

    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    expr_names = {f"#{k}": k for k in updates}
    expr_values = {f":{k}": v for k, v in updates.items()}
    users_table.update_item(
        Key={"user_id": user_id},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in updates),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )

    user.update(updates)
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "profile_photo": user.get("profile_photo"),
    }


app.include_router(router)
