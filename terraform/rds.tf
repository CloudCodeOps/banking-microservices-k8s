# ---------------------------------------------------------------------------
# RDS (MySQL) - relational replica of user accounts.
# DynamoDB (see dynamodb.tf) is the source of truth for registration/login;
# every write there is streamed by the users-db-sync Lambda (see lambda.tf)
# into this database so accounts can also be queried/joined relationally.
# Only that Lambda talks to this database - the users-service pod itself
# only ever touches DynamoDB.
# ---------------------------------------------------------------------------

resource "random_password" "db_master" {
  length      = 24
  special     = false # RDS master password disallows some special chars
  min_upper   = 2
  min_lower   = 2
  min_numeric = 2
}

resource "aws_db_subnet_group" "users" {
  name       = "${var.project_name}-${var.environment}-users-db"
  subnet_ids = local.private_subnet_ids
}

# Security group attached to the users-db-sync Lambda's ENIs (the Lambda
# runs inside the VPC so it can reach RDS over 3306).
resource "aws_security_group" "users_db_sync_lambda" {
  name        = "${var.project_name}-${var.environment}-users-db-sync-lambda-sg"
  description = "Attached to the users-db-sync Lambda (DynamoDB Streams to RDS)"
  vpc_id      = local.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "users_db" {
  name        = "${var.project_name}-${var.environment}-users-db-sg"
  description = "Allow MySQL (3306) from the users-db-sync Lambda to RDS"
  vpc_id      = local.vpc_id

  ingress {
    description    = "MySQL from the users-db-sync Lambda"
    from_port      = 3306
    to_port        = 3306
    protocol       = "tcp"
    security_groups = [aws_security_group.users_db_sync_lambda.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Regular RDS MySQL instance.
# This replaces the previous Aurora cluster configuration because the
# current AWS Free Plan/sandbox account does not permit normal Aurora
# cluster creation.
resource "aws_db_instance" "users" {
  identifier = "${var.project_name}-${var.environment}-users-db"

  engine         = "mysql"
  instance_class = "db.t3.micro"

  # No engine_version pinned on purpose so AWS can use the current
  # supported default MySQL version for the region/account.
  db_name = "veerabank_users"
  username         = "veerabank_admin"
  password         = random_password.db_master.result

  port = 3306

  db_subnet_group_name   = aws_db_subnet_group.users.name
  vpc_security_group_ids = [aws_security_group.users_db.id]

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  skip_final_snapshot     = true
  backup_retention_period = 1
}

# Credentials handed to the users-db-sync Lambda via a private S3 bucket
# (never baked into the image or a k8s manifest in plaintext).
resource "aws_s3_bucket" "users_db_creds" {
  bucket = "${var.project_name}-${var.environment}-users-db-creds-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "users_db_creds" {
  bucket = aws_s3_bucket.users_db_creds.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "users_db_creds" {
  bucket = aws_s3_bucket.users_db_creds.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "users_db_creds" {
  bucket = aws_s3_bucket.users_db_creds.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

locals {
  users_db_creds_key = "users-db-credentials.json"
}

resource "aws_s3_object" "users_db_creds" {
  bucket                 = aws_s3_bucket.users_db_creds.id
  key                    = local.users_db_creds_key
  server_side_encryption = "AES256"
  content_type           = "application/json"

  content = jsonencode({
    username = aws_db_instance.users.username
    password = random_password.db_master.result
    host     = aws_db_instance.users.address
    port     = aws_db_instance.users.port
    dbname   = aws_db_instance.users.db_name
  })

  depends_on = [aws_db_instance.users]
}

resource "aws_iam_policy" "users_db_secret_access" {
  name        = "${var.project_name}-${var.environment}-users-db-creds-access"
  description = "Allows the users-db-sync Lambda to read the RDS MySQL credentials object from S3"

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Sid    = "ReadUsersDbCredsObject"
        Effect = "Allow"

        Action = [
          "s3:GetObject"
        ]

        Resource = "${aws_s3_bucket.users_db_creds.arn}/${local.users_db_creds_key}"
      },
      {
        Sid    = "ListUsersDbCredsBucket"
        Effect = "Allow"

        Action = [
          "s3:GetBucketLocation"
        ]

        Resource = aws_s3_bucket.users_db_creds.arn
      }
    ]
  })
}
