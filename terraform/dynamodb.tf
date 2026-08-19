resource "aws_dynamodb_table" "accounts" {
  name         = "${var.project_name}-${var.environment}-accounts"
  billing_mode = var.dynamodb_billing_mode
  hash_key     = "account_id"

  attribute {
    name = "account_id"
    type = "S"
  }

  # Every account item carries a user_id; this table also holds one
  # "lock" item per user (account_id = "LOCK#<user_id>") so account
  # creation can atomically enforce exactly one account per user - see
  # backend/services/accounts. The GSI is for looking accounts up by
  # user_id; the uniqueness guarantee itself comes from the lock item's
  # ConditionExpression, not from this (eventually-consistent) index.
  attribute {
    name = "user_id"
    type = "S"
  }

  # Public account number a sender types in to transfer money to someone
  # else (see GET /accounts/by-number/{account_number} in
  # backend/services/accounts). Indexed so that lookup is a direct Query
  # instead of a table Scan.
  attribute {
    name = "account_number"
    type = "S"
  }

  global_secondary_index {
    name            = "user_id-index"
    hash_key        = "user_id"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "account_number-index"
    hash_key        = "account_number"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ---------------------------------------------------------------------------
# "transfers" table - real money movement between two accounts. Pulled out
# of the generic id-keyed loop below because it needs GSIs so both parties
# to a transfer can look up their transfer history (see
# backend/services/transfers).
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "transfers" {
  name         = "${var.project_name}-${var.environment}-transfers"
  billing_mode = var.dynamodb_billing_mode
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "from_account_id"
    type = "S"
  }

  attribute {
    name = "to_account_id"
    type = "S"
  }

  global_secondary_index {
    name            = "from_account_id-index"
    hash_key        = "from_account_id"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "to_account_id-index"
    hash_key        = "to_account_id"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ---------------------------------------------------------------------------
# "users" table - source of truth for registration/login. Streams feed the
# users-db-sync Lambda (see lambda.tf), which replicates every write into
# the Aurora MySQL "users" table (see rds.tf) for relational querying.
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "users" {
  name         = "${var.project_name}-${var.environment}-users"
  billing_mode = var.dynamodb_billing_mode
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  # Required so the users-db-sync Lambda can consume inserts/updates/deletes
  # and mirror them into RDS.
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
}

# ---------------------------------------------------------------------------
# "otp_codes" table - short-lived email verification codes used by
# users-service's /users/otp/send + /users/otp/verify (registration is
# gated on a verified code - see backend/services/users). One item per
# email; TTL cleans up expired codes and stale verified-flags automatically
# so this table never needs manual pruning.
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "otp_codes" {
  name         = "${var.project_name}-${var.environment}-otp_codes"
  billing_mode = var.dynamodb_billing_mode
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }
}
# can list "my cards", "my loans", etc. via a Query instead of a table
# Scan). audit-log, fraud-detection, admin, statements, and reports are
# staff-facing/bank-wide views instead, so they don't get this GSI.
locals {
  user_indexed_generic_services = toset([
    "cards", "loans", "payments", "beneficiaries", "kyc",
    "fixed-deposits", "cheques", "disputes", "support-tickets",
    "rewards", "notifications",
  ])
}

# One id-keyed table per generic microservice (cards, loans, payments, ...).
resource "aws_dynamodb_table" "generic" {
  for_each = toset(local.generic_services)

  name         = "${var.project_name}-${var.environment}-${each.value}"
  billing_mode = var.dynamodb_billing_mode
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  dynamic "attribute" {
    for_each = contains(local.user_indexed_generic_services, each.value) ? [1] : []
    content {
      name = "user_id"
      type = "S"
    }
  }

  dynamic "global_secondary_index" {
    for_each = contains(local.user_indexed_generic_services, each.value) ? [1] : []
    content {
      name            = "user_id-index"
      hash_key        = "user_id"
      projection_type = "ALL"
    }
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_iam_policy" "dynamodb_app_access" {
  name        = "${var.project_name}-${var.environment}-dynamodb-app-access"
  description = "Allows the VeeraBank backend pods to read/write their DynamoDB tables"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AppTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:ConditionCheckItem",
          "dynamodb:TransactGetItems",
          "dynamodb:TransactWriteItems"
        ]
        Resource = concat(
          [
            aws_dynamodb_table.accounts.arn,
            "${aws_dynamodb_table.accounts.arn}/index/*",
            aws_dynamodb_table.users.arn,
            "${aws_dynamodb_table.users.arn}/index/*",
            aws_dynamodb_table.transfers.arn,
            "${aws_dynamodb_table.transfers.arn}/index/*",
            aws_dynamodb_table.otp_codes.arn,
          ],
          [for t in aws_dynamodb_table.generic : t.arn],
          [for t in aws_dynamodb_table.generic : "${t.arn}/index/*"],
        )
      }
    ]
  })
}
