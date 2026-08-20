output "eks_cluster_name" {
  value = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "configure_kubectl" {
  description = "Run this to set up kubectl access"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

output "ecr_repository_urls" {
  description = "Map of service name -> ECR repository URL"
  value       = { for name, repo in aws_ecr_repository.service : name => repo.repository_url }
}

output "dynamodb_accounts_table" {
  value = aws_dynamodb_table.accounts.name
}

output "backend_irsa_role_arn" {
  description = "Put this on the Kubernetes ServiceAccount annotation eks.amazonaws.com/role-arn"
  value       = module.backend_app_irsa.iam_role_arn
}

output "vpc_id" {
  value = local.vpc_id
}

output "users_db_endpoint" {
  description = " MySQL writer endpoint (replica of the users DynamoDB table, fed by users-db-sync)"
  value       = aws_db_instance.users.endpoint
}

output "users_db_reader_endpoint" {
  description = "Aurora MySQL reader endpoint - load-balances across all reader instances (read-only queries only)"
  value       = aws_db_instance.users.address
}

output "users_db_name" {
  value = aws_db_instance.users.db_name
}

output "users_db_creds_bucket" {
  description = "S3 bucket holding the Aurora MySQL credentials object used by the users-db-sync Lambda"
  value       = aws_s3_bucket.users_db_creds.bucket
}

output "users_db_creds_key" {
  description = "S3 object key (inside users_db_creds_bucket) holding the DB credentials JSON"
  value       = aws_s3_object.users_db_creds.key
}

output "transaction_history_bucket" {
  description = "Per-user activity history bucket (folder per user_id/account_id)"
  value       = aws_s3_bucket.transaction_history.bucket
}

output "transactions_history_api_url" {
  description = "Base URL of the general-purpose per-user history API Gateway (Lambda-backed, reads/writes S3)"
  value       = aws_apigatewayv2_stage.transactions_history.invoke_url
}
