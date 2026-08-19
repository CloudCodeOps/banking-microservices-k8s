"""
notification-writer Lambda
---------------------------
The "notifications-service" subscriber to the user-registered SNS topic.

SNS -> SQS (user-registered-notifications queue) -> this Lambda, which does
two things per new registration:
  1. Writes a row into the same DynamoDB table the notifications-service
     microservice already reads from (GET /notifications/items), so a
     welcome notification shows up in-app with no extra plumbing.
  2. If SES_SENDER_EMAIL is set (var.ses_sender_email in terraform), sends
     the new user a real welcome email via SES, using the structured
     message the users-service publishes (see backend/services/users).
"""
import json
import os
import uuid
from datetime import datetime, timezone

import boto3

dynamodb = boto3.resource("dynamodb", region_name=os.getenv("AWS_REGION", "us-east-1"))
TABLE_NAME = os.environ["NOTIFICATIONS_TABLE"]
table = dynamodb.Table(TABLE_NAME)

ses = boto3.client("ses", region_name=os.getenv("AWS_REGION", "us-east-1"))
SENDER_EMAIL = os.getenv("SES_SENDER_EMAIL", "")


def _send_welcome_email(payload: dict):
    to_email = payload.get("email")
    if not SENDER_EMAIL or not to_email:
        if not SENDER_EMAIL:
            print("[notification-writer] SES_SENDER_EMAIL not set, skipping welcome email")
        return

    full_name = payload.get("full_name", "there")
    try:
        ses.send_email(
            Source=SENDER_EMAIL,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": "Welcome to VeeraBank!"},
                "Body": {
                    "Text": {
                        "Data": (
                            f"Hi {full_name},\n\n"
                            "Your VeeraBank account has been created successfully. "
                            "Welcome aboard!\n\nVeeraBank"
                        )
                    }
                },
            },
        )
    except Exception as exc:  # noqa: BLE001 - don't fail the whole batch over one email
        print(f"[notification-writer] SES send_email failed: {exc}")


def handler(event, context):
    for record in event.get("Records", []):
        # SQS record body is the raw SNS message envelope (JSON string).
        sqs_body = json.loads(record["body"])
        raw_message = sqs_body.get("Message", sqs_body.get("body", ""))
        subject = sqs_body.get("Subject", "Notification")

        # users-service publishes the SNS Message as a JSON string; fall
        # back to treating it as plain text for any other publisher.
        try:
            payload = json.loads(raw_message)
            display_message = payload.get("summary", raw_message)
        except (json.JSONDecodeError, TypeError):
            payload = {}
            display_message = raw_message

        item = {
            "id": str(uuid.uuid4()),
            "user_id": payload.get("user_id", "unknown"),
            "type": "user_registered",
            "subject": subject,
            "message": display_message,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        table.put_item(Item=item)

        _send_welcome_email(payload)

    return {"statusCode": 200}
