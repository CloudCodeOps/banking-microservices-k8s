# ---------------------------------------------------------------------------
# SES - lets the notification-writer Lambda send each new user a real
# welcome email (separate from the SNS -> SQS -> DynamoDB in-app
# notification, and separate from the ops-alert SNS email subscription in
# sns.tf). Set var.ses_sender_email to enable it.
#
# SES starts every account in the sandbox: both the sender AND every
# recipient address must be verified before mail actually sends. AWS
# emails a confirmation link to the sender address below - click it once.
# To email arbitrary (unverified) recipients, request SES production
# access in the AWS console.
#
# Pluralsight sandbox note: this account's SES is further capped by
# Pluralsight itself, on top of the normal AWS sandbox limit above - you
# can only send to an @example.com address, the SES mailbox simulator, or
# yourself (identical from/to), max 19 send attempts per lab. A real new
# user's inbox will never actually receive the welcome email here; that's
# a platform limit of the training sandbox, not a bug in this code.
# ---------------------------------------------------------------------------

resource "aws_ses_email_identity" "sender" {
  count = var.ses_sender_email != "" ? 1 : 0
  email = var.ses_sender_email
}
