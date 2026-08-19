module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.24"

  cluster_name    = "${var.project_name}-${var.environment}-eks"
  cluster_version = var.eks_cluster_version

  cluster_endpoint_public_access = true

  vpc_id     = local.vpc_id
  subnet_ids = local.private_subnet_ids

  enable_cluster_creator_admin_permissions = true

  # OIDC provider is required for IRSA (IAM Roles for Service Accounts) -
  # used by both the ALB controller and the backend app to reach DynamoDB.
  cluster_addons = {
    coredns                = { most_recent = true }
    kube-proxy              = { most_recent = true }
    vpc-cni                 = { most_recent = true }
  }

  eks_managed_node_groups = {
    default = {
      instance_types = var.node_instance_types
      capacity_type  = "ON_DEMAND"

      min_size     = var.node_min_size
      max_size     = var.node_max_size
      desired_size = var.node_desired_size

      labels = {
        role = "app"
      }
    }
  }
}

# ---------------------------------------------------------------------------
# EBS CSI Driver - IRSA role + addon
# (Without this role, the driver's pods can't call EC2 (CreateVolume/
# AttachVolume/...) so the addon sits stuck in "Creating" forever.)
# ---------------------------------------------------------------------------

module "ebs_csi_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.44"

  role_name             = "${var.project_name}-${var.environment}-ebs-csi"
  attach_ebs_csi_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }
}

resource "aws_eks_addon" "ebs_csi" {
  cluster_name             = module.eks.cluster_name
  addon_name                = "aws-ebs-csi-driver"
  service_account_role_arn = module.ebs_csi_irsa.iam_role_arn
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [module.eks]
}

# ---------------------------------------------------------------------------
# AWS Load Balancer Controller - IRSA role + Helm install
# ---------------------------------------------------------------------------

module "alb_controller_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.44"

  role_name = "${var.project_name}-${var.environment}-alb-controller"

  attach_load_balancer_controller_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:aws-load-balancer-controller"]
    }
  }
}

resource "kubernetes_service_account" "alb_controller" {
  metadata {
    name      = "aws-load-balancer-controller"
    namespace = "kube-system"
    labels = {
      "app.kubernetes.io/name"      = "aws-load-balancer-controller"
      "app.kubernetes.io/component" = "controller"
    }
    annotations = {
      "eks.amazonaws.com/role-arn" = module.alb_controller_irsa.iam_role_arn
    }
  }

  depends_on = [module.eks]
}

resource "helm_release" "alb_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.8.1"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "serviceAccount.create"
    value = "false"
  }

  set {
    name  = "serviceAccount.name"
    value = kubernetes_service_account.alb_controller.metadata[0].name
  }

  set {
    name  = "region"
    value = var.aws_region
  }

  set {
    name  = "vpcId"
    value = local.vpc_id
  }

  depends_on = [kubernetes_service_account.alb_controller]
}

# ---------------------------------------------------------------------------
# IRSA role for the backend app -> DynamoDB access (no static AWS keys needed)
# ---------------------------------------------------------------------------

module "backend_app_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.44"

  role_name = "${var.project_name}-${var.environment}-backend-dynamodb"

  role_policy_arns = {
    dynamodb   = aws_iam_policy.dynamodb_app_access.arn
    sns        = aws_iam_policy.sns_publish_user_registered.arn
  }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["${var.project_name}:backend-app"]
    }
  }
}
