# ---------------------------------------------------------------------------
# RDS (Aurora MySQL Serverless v2) - relational replica of user accounts.
# DynamoDB (see dynamodb.tf) is the source of truth for registration/login;
# every write there is streamed by the users-db-sync Lambda (see lambda.tf)
# into this cluster so accounts can also be queried/joined relationally.
# Only that Lambda talks to this cluster - the users-service pod itself
# only ever touches DynamoDB.
# ---------------------------------------------------------------------------

resource "random_password" "db_master" {
  length      = 24
  special     = false # Aurora master password disallows some special chars
  min_upper   = 2
  min_lower   = 2
  min_numeric = 2
}

resource "aws_db_subnet_group" "users" {
  name       = "${var.project_name}-${var.environment}-users-db"
  subnet_ids = local.private_subnet_ids
}

# Security group attached to the users-db-sync Lambda's ENIs (the Lambda
# runs inside the VPC so it can reach the RDS cluster over 3306).
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
  description = "Allow MySQL (3306) from the users-db-sync Lambda to the users Aurora cluster"
  vpc_id      = local.vpc_id

  ingress {
    description     = "MySQL from the users-db-sync Lambda"
    from_port        = 3306
    to_port          = 3306
    protocol         = "tcp"
    security_groups  = [aws_security_group.users_db_sync_lambda.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_rds_cluster" "users" {
  cluster_identifier     = "${var.project_name}-${var.environment}-users-db"
  engine                 = "aurora-mysql"
  engine_mode            = "provisioned"
  # No engine_version pinned on purpose: Aurora MySQL minor versions get
  # retired periodically, and a hardcoded one (e.g. 3.07.1) will eventually
  # 400 with "Cannot find version ... for aurora-mysql". Omitting it lets
  # AWS pick its current default, which is always installable.
  database_name          = "veerabank_users"
  master_username         = "veerabank_admin"
  master_password         = random_password.db_master.result
  db_subnet_group_name    = aws_db_subnet_group.users.name
  vpc_security_group_ids  = [aws_security_group.users_db.id]

  storage_encrypted      = true
  skip_final_snapshot    = true
  backup_retention_period = 1

  # NOTE: no serverlessv2_scaling_configuration here on purpose. This runs
  # in the Pluralsight AWS sandbox, whose org-level SCP explicitly denies
  # rds:CreateDBInstance for any class other than t3/t4g micro/small/medium
  # (db.serverless gets a hard AccessDenied). So both instances below are
  # regular provisioned t3 instances instead of Aurora Serverless v2.
}

# Writer instance - the cluster's primary. All INSERT/UPDATE/DELETE traffic
# (from the users-db-sync Lambda) goes here, either directly via the
# cluster endpoint or explicitly via aws_rds_cluster.users.endpoint.
resource "aws_rds_cluster_instance" "writer" {
  identifier          = "${var.project_name}-${var.environment}-users-db-writer"
  cluster_identifier  = aws_rds_cluster.users.id
  instance_class      = "db.t3.micro"
  engine              = aws_rds_cluster.users.engine
  engine_version      = aws_rds_cluster.users.engine_version
  promotion_tier      = 0
}

# Reader instance - a second Aurora instance in the same cluster. Any
# service that only needs to SELECT (e.g. reporting/joins off the RDS
# replica) should point at aws_rds_cluster.users.reader_endpoint, which
# load-balances across all non-writer instances - this one included. It
# also gives the cluster automatic failover if the writer instance fails.
resource "aws_rds_cluster_instance" "reader" {
  identifier          = "${var.project_name}-${var.environment}-users-db-reader"
  cluster_identifier  = aws_rds_cluster.users.id
  instance_class      = "db.t3.micro"
  engine              = aws_rds_cluster.users.engine
  engine_version      = aws_rds_cluster.users.engine_version
  promotion_tier      = 1
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
  bucket                  = aws_s3_bucket.users_db_creds.id
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
    username    = aws_rds_cluster.users.master_username
    password    = random_password.db_master.result
    # Writes (the users-db-sync Lambda) go to the cluster/writer endpoint.
    host        = aws_rds_cluster.users.endpoint
    # Read-only callers should use this instead - it load-balances across
    # every reader instance in the cluster (aws_rds_cluster_instance.reader).
    reader_host = aws_rds_cluster.users.reader_endpoint
    port        = 3306
    dbname      = aws_rds_cluster.users.database_name
  })

  depends_on = [aws_rds_cluster_instance.writer, aws_rds_cluster_instance.reader]
}

resource "aws_iam_policy" "users_db_secret_access" {
  name        = "${var.project_name}-${var.environment}-users-db-creds-access"
  description = "Allows the users-db-sync Lambda to read the Aurora MySQL credentials object from S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadUsersDbCredsObject"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.users_db_creds.arn}/${local.users_db_creds_key}"
      },
      {
        Sid      = "ListUsersDbCredsBucket"
        Effect   = "Allow"
        Action   = ["s3:GetBucketLocation"]
        Resource = aws_s3_bucket.users_db_creds.arn
      }
    ]
  })
}
