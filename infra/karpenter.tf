#Configure the IAM role for the Karpenter service account to assume the role and access AWS resources
resource "aws_iam_role" "karpenter_irsa_role" {
  name = "karpenter_irsa_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.eks_oidc_provider.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${replace(aws_eks_cluster.eks_prod_cluster.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:karpenter:karpenter"
            "${replace(aws_eks_cluster.eks_prod_cluster.identity[0].oidc[0].issuer, "https://", "")}:aud" = "sts.amazonaws.com"
          }
        }
      },
    ]
  })
}

#create an IAM policy for the Karpenter service account to access AWS resources

resource "aws_iam_policy" "karpenter_irsa_policy" {
  name        = "karpenter_irsa_policy"
  description = "IAM policy for Karpenter service account to access AWS resources"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:RunInstances",
          "ec2:DescribeInstances",
          "ec2:TerminateInstances",
          "iam:PassRole",
            "ec2:DescribeLaunchTemplates",
            "ec2:DescribeSecurityGroups",
            "ec2:DescribeSubnets",
            "ec2:DescribeVpcs",
            "ec2:DescribeImages",
            "ec2:DescribeInstanceTypes",
            "ec2:CreateFleet",
            "ec2:CreateLaunchTemplate",
            "ec2:DeleteLaunchTemplate",
            "ec2:DescribeAvailabilityZones",
            "pricing:GetProducts",
            "ssm:GetParameter",
        ]
        Resource = "*"
      },
    ]
  })
}

#attach the IAM policy to the IAM role for the Karpenter service account

resource "aws_iam_role_policy_attachment" "karpenter_irsa_role_policy_attachment" {
  policy_arn = aws_iam_policy.karpenter_irsa_policy.arn
   role       = aws_iam_role.karpenter_irsa_role.name
}
