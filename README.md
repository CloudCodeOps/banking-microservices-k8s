# VeeraBank EKS

Cloud-native banking application built using **AWS EKS, Terraform, Kubernetes, DynamoDB, Aurora MySQL, Lambda, S3, SNS, SQS, SES, API Gateway, ECR, and Groq**.

---

## 🏗️ Architecture

<img src="https://images.openai.com/static-rsc-4/ZJXCKWNftQQL9vGY8YKxBChV_FtYN4Puo2HQM2XLLV2Vuy0QZS9KR1SQuZzdZPLsubMLiF-tIDxe102oKcLA-bWyXYPUIVi79xrqLd3JYoC0LSXv1jVxAw6XeDY5ySDiZcYUJuTyTpM3l1f7ud-1q7TWmopB31wIXBAP9QhHl6gORKMX6cA3UZ_uO1jSCV3X?purpose=fullsize" alt="VeeraBank AWS Architecture" width="100%">

---

## 📁 Project Structure

```text
veerabank-eks/
├── terraform/
│   ├── rds.tf                # Aurora MySQL replica of the users table
│   ├── s3.tf                 # Per-user history bucket
│   ├── lambda.tf             # Lambda + API Gateway resources
│   ├── ses.tf                # SES sender identity for welcome emails
│   ├── sns.tf                # User-registered SNS topic
│   ├── dynamodb.tf           # DynamoDB tables + Streams
│   ├── vpc.tf                # VPC configuration
│   ├── eks.tf                # EKS cluster configuration
│   ├── ecr.tf                # ECR repositories
│   ├── variables.tf          # Terraform variables
│   ├── outputs.tf            # Terraform outputs
│   └── main.tf               # Main Terraform configuration
│
├── backend/
│   ├── common/
│   │   └── Shared DynamoDB, SNS, S3 and SMTP helpers
│   │
│   ├── lambdas/
│   │   ├── transactions_history/
│   │   │   └── General-purpose per-user S3 history
│   │   │
│   │   ├── notification_writer/
│   │   │   └── SQS → DynamoDB + SES welcome email
│   │   │
│   │   └── users_db_sync/
│   │       └── DynamoDB Streams → Aurora MySQL
│   │
│   └── services/
│       ├── accounts/
│       ├── transactions/
│       ├── users/
│       ├── chatbot/
│       ├── transfers/
│       ├── cards/
│       ├── loans/
│       ├── payments/
│       ├── beneficiaries/
│       ├── statements/
│       ├── notifications/
│       ├── kyc/
│       ├── fixed-deposits/
│       ├── cheques/
│       ├── disputes/
│       ├── audit-log/
│       ├── fraud-detection/
│       ├── support-tickets/
│       ├── rewards/
│       ├── admin/
│       └── reports/
│
├── frontend/
│   └── Single-page HTML/CSS/JS banking dashboard
│
└── k8s/
    ├── services/
    │   └── Deployment + Service manifest per microservice
    ├── frontend/
    ├── app-secrets.example.yaml
    ├── ingress.yaml
    ├── namespace.yaml
    └── serviceaccount.yaml


## 🔐 Required GitHub Secrets

Add the following secrets to your GitHub repository:


    
