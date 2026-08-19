#!/usr/bin/env bash
# One-time setup: creates the S3 bucket + DynamoDB table terraform needs
# for remote state. Run this ONCE, before the first `terraform init` /
# before the first CI/CD run. Safe to re-run (skips anything that already
# exists).
#
# Run this in AWS CloudShell (console, top-right icon) or any shell with
# the AWS CLI configured against this account.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_TF="$SCRIPT_DIR/../terraform/main.tf"
STATE_FILE="$SCRIPT_DIR/.tfstate-bucket-name"  # remembers the bucket we actually created

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
TABLE="veerabank-terraform-locks"
REGION="us-east-1"
MAX_ATTEMPTS=5

# Reuse whatever bucket we successfully created on a previous run, if any -
# state must live in the SAME bucket across runs, so we never want to
# silently start pointing at a brand new empty bucket once one already works.
TF_BUCKET="$(grep -oP 'bucket\s+= "\K[^"]+' "$MAIN_TF" | head -1 || true)"

if [ -f "$STATE_FILE" ]; then
  BUCKET="$(cat "$STATE_FILE")"
  echo "== Reusing previously-bootstrapped bucket (from $STATE_FILE): $BUCKET =="
elif [ -n "$TF_BUCKET" ] && aws s3api head-bucket --bucket "$TF_BUCKET" 2>/dev/null; then
  # No local state file (e.g. fresh checkout), but main.tf already points at
  # a bucket that exists and this account can reach - reuse it rather than
  # spawning a new one.
  BUCKET="$TF_BUCKET"
  echo "== Reusing bucket already referenced in terraform/main.tf: $BUCKET =="
else
  BUCKET="veerabank-tfstate-${ACCOUNT_ID}-$(openssl rand -hex 4 2>/dev/null || echo "$RANDOM$RANDOM")"
  echo "== No existing bucket found - generating a new unique name: $BUCKET =="
fi

echo "== Creating S3 bucket: $BUCKET in $REGION =="

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "Bucket already exists and is accessible, skipping create."
else
  attempt=1
  while :; do
    # head-bucket said "no" (404, or a 403 we can't distinguish from 404),
    # but create-bucket can still fail with BucketAlreadyExists - notably
    # us-east-1 returns that generic error even when *this* account already
    # owns the bucket, instead of the friendlier BucketAlreadyOwnedByYou.
    # So: attempt the create, then re-check access rather than trusting
    # create-bucket's error message alone.
    set +e
    CREATE_OUTPUT=$(aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" 2>&1)
    CREATE_STATUS=$?
    set -e

    if [ $CREATE_STATUS -eq 0 ]; then
      echo "Bucket created: $BUCKET"
      break
    elif aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
      echo "Bucket creation reported an error, but it's accessible under this account - continuing."
      break
    fi

    echo "$CREATE_OUTPUT" >&2
    if [ $attempt -ge $MAX_ATTEMPTS ]; then
      echo ""
      echo "== Bucket name '$BUCKET' is not usable after $MAX_ATTEMPTS attempts =="
      echo "S3 bucket names are unique across ALL of AWS, not just your account."
      echo "Every generated name collided or is stuck mid-delete elsewhere."
      echo "Try re-running this script (it generates a fresh random name each"
      echo "time it doesn't already have one recorded in scripts/.tfstate-bucket-name)."
      exit 1
    fi

    NEW_BUCKET="veerabank-tfstate-${ACCOUNT_ID}-$(openssl rand -hex 4 2>/dev/null || echo "$RANDOM$RANDOM")"
    echo "== '$BUCKET' unusable, retrying with a new unique name: $NEW_BUCKET (attempt $((attempt+1))/$MAX_ATTEMPTS) =="
    BUCKET="$NEW_BUCKET"
    attempt=$((attempt+1))
  done
fi

# Remember this bucket for next time, and keep terraform/main.tf's backend
# block pointed at whatever bucket we actually ended up with, automatically.
echo "$BUCKET" > "$STATE_FILE"

CURRENT_TF_BUCKET="$(grep -oP 'bucket\s+= "\K[^"]+' "$MAIN_TF" | head -1 || true)"
if [ "$CURRENT_TF_BUCKET" != "$BUCKET" ]; then
  echo "== Updating terraform/main.tf backend bucket: ${CURRENT_TF_BUCKET:-<none found>} -> $BUCKET =="
  if [ -n "$CURRENT_TF_BUCKET" ]; then
    sed -i.bak -E "s/(bucket[[:space:]]+= \")${CURRENT_TF_BUCKET}(\")/\1${BUCKET}\2/" "$MAIN_TF"
  else
    # Couldn't parse an existing value out of the backend block - replace
    # the whole bucket line instead, whatever string it currently holds.
    sed -i.bak -E "s/^([[:space:]]*bucket[[:space:]]+= \").*(\")\$/\1${BUCKET}\2/" "$MAIN_TF"
  fi
  rm -f "${MAIN_TF}.bak"
fi

echo "== Enabling versioning =="
aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

echo "== Enabling default encryption (AES256) =="
aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

echo "== Blocking public access =="
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "== Creating DynamoDB lock table: $TABLE =="
if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
  echo "Table already exists, skipping create."
else
  aws dynamodb create-table \
    --table-name "$TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION"
fi

echo ""
echo "Done. terraform/main.tf now points at bucket: $BUCKET"

if command -v terraform >/dev/null 2>&1; then
  echo "== Running 'terraform init -reconfigure' so the new bucket takes effect right now =="
  (cd "$SCRIPT_DIR/../terraform" && terraform init -reconfigure)
else
  echo "terraform CLI not found on PATH - install it, then run:"
  echo "  cd terraform && terraform init -reconfigure"
fi
