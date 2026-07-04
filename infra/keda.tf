#Configure the IAM role for the keda service account to assume the role and access AWS resources
resource "aws_iam_role" "keda_irsa_role" {
  name = "keda_irsa_role"

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
            "${replace(aws_eks_cluster.eks_prod_cluster.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:keda:kedaoperator"
            "${replace(aws_eks_cluster.eks_prod_cluster.identity[0].oidc[0].issuer, "https://", "")}:aud" = "sts.amazonaws.com"
          }
        }
      },
    ]
  })
}

#create an IAM policy for the Keda service account to access AWS resources

resource "aws_iam_policy" "keda_irsa_policy" {
  name        = "keda_irsa_policy"
  description = "IAM policy for keda service account to access AWS resources"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [

    #sqs

    {

      Effect = "Allow"

      Action = [

        "sqs:GetQueueAttributes",
        "sqs:GetQueueUrl",

      ]

      Resource = aws_sqs_queue.rbac_scan_queue.arn

    },

  ]

})
}

#attach the IAM policy to the IAM role for the Keda service account

resource "aws_iam_role_policy_attachment" "keda_irsa_role_policy_attachment" {
  policy_arn = aws_iam_policy.keda_irsa_policy.arn
   role       = aws_iam_role.keda_irsa_role.name
}



#Configure the IAM role for the keda service account to assume the role and access AWS resources
resource "aws_iam_role" "consumer_irsa_role" {
  name = "consumer_irsa_role"

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
            "${replace(aws_eks_cluster.eks_prod_cluster.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:consumer:consumer"
            "${replace(aws_eks_cluster.eks_prod_cluster.identity[0].oidc[0].issuer, "https://", "")}:aud" = "sts.amazonaws.com"
          }
        }
      },
    ]
  })
}

#create an IAM policy for the consumer service account to access AWS resources

resource "aws_iam_policy" "consumer_irsa_policy" {
  name        = "consumer_irsa_policy"
  description = "IAM policy for consumer service account to access AWS resources"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [

    #sqs

    {

      Effect = "Allow"

      Action = [

        "sqs:ReceiveMessage",

        "sqs:DeleteMessage",

        "sqs:ChangeMessageVisibility",

        "sqs:GetQueueAttributes",

        "sqs:GetQueueUrl"
      ]

      Resource = aws_sqs_queue.rbac_scan_queue.arn

    },

  ]

})
}

#attach the IAM policy to the IAM role for the consumer service account

resource "aws_iam_role_policy_attachment" "consumer_irsa_role_policy_attachment" {
  policy_arn = aws_iam_policy.consumer_irsa_policy.arn
   role       = aws_iam_role.consumer_irsa_role.name
}