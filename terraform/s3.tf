# ---------------------------------------------------------------------------
# S3 - durable store for user transaction history. Every deposit/withdrawal
# processed by the transactions-service is written here (via the
# transactions-history Lambda) instead of DynamoDB, and read back the same
# way for statements/history views.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "transaction_history" {
  bucket = "${var.project_name}-${var.environment}-transaction-history-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "transaction_history" {
  bucket = aws_s3_bucket.transaction_history.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "transaction_history" {
  bucket = aws_s3_bucket.transaction_history.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "transaction_history" {
  bucket                  = aws_s3_bucket.transaction_history.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
