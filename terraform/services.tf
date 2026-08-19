# Single source of truth for the microservices in this project.
# accounts, transactions, users, and transfers have custom schemas
# (defined explicitly in dynamodb.tf, since transfers needs GSIs to look
# up a transfer by either the sending or receiving account); everything
# in `generic_services` gets a simple id-keyed table generated via
# for_each.
locals {
  generic_services = [
    "cards", "loans", "payments", "beneficiaries",
    "statements", "notifications", "kyc", "fixed-deposits", "cheques",
    "disputes", "audit-log", "fraud-detection", "support-tickets",
    "rewards", "admin", "reports",
  ]

  # Every backend microservice (used for ECR repos + IRSA policy).
  # chatbot is stateless (just calls the Groq API, no DynamoDB table of its
  # own) so it's listed directly here rather than in generic_services.
  backend_services = concat(["accounts", "transactions", "users", "transfers", "chatbot"], local.generic_services)

  # Everything that gets its own ECR repo, including the frontend.
  all_images = concat(local.backend_services, ["frontend"])
}
