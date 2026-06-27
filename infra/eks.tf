
#eks cluster for the production environment
resource "aws_eks_cluster" "eks_prod_cluster" {
  name = "myekscluster-prod"

  access_config {
    authentication_mode = "API"
  }

  role_arn = aws_iam_role.cluster.arn

  version  = "1.35"

enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  vpc_config {
    subnet_ids = [
      
      aws_subnet.prod-public-subnet-1.id,
      aws_subnet.prod-public-subnet-2.id,
      aws_subnet.prod-private-subnet-1.id,
      aws_subnet.prod-private-subnet-2.id
    ]
  }

 



  # Ensure that IAM Role permissions are created before and deleted
  # after EKS Cluster handling. Otherwise, EKS will not be able to
  # properly delete EKS managed EC2 infrastructure such as Security Groups.
  depends_on = [
    aws_iam_role_policy_attachment.cluster_AmazonEKSClusterPolicy,
  ]

  tags = {
    Name        = "myekscluster-prod"
    Environment = "production"
  }
}
#role for the EKS cluster
resource "aws_iam_role" "cluster" {
  name = "eks-cluster-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "sts:AssumeRole",
          "sts:TagSession"
        ]
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
      },
    ]
  })
}
#role for the node group

resource "aws_iam_role" "node_group" {
  name = "eks-node-group-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "sts:AssumeRole",
          "sts:TagSession"
        ]
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      },
    ]
  })
}

#role policy attachments for the EKS cluster and node group

resource "aws_iam_role_policy_attachment" "cluster_AmazonEKSClusterPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

resource "aws_iam_role_policy_attachment" "cluster_CNI_Policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node_group.name
}
resource "aws_iam_role_policy_attachment" "cluster_ECRPullOnly" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "cluster_AmazonEKSWorkerNodePolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node_group.name
}

# node group for the EKS cluster
resource "aws_eks_node_group" "eks_prod_node_group" {
  cluster_name    = aws_eks_cluster.eks_prod_cluster.name
  node_group_name = "myekscluster-prod-node-group"
  node_role_arn   = aws_iam_role.node_group.arn
  subnet_ids      = [
    aws_subnet.prod-private-subnet-1.id,
    aws_subnet.prod-private-subnet-2.id
  ] 

  scaling_config {
    desired_size = 2
    max_size     = 2
    min_size     = 1
  }

  instance_types = ["t3.medium"]
  capacity_type = "ON_DEMAND"

  depends_on = [
    aws_iam_role_policy_attachment.cluster_AmazonEKSWorkerNodePolicy,
    aws_iam_role_policy_attachment.cluster_CNI_Policy,
    aws_iam_role_policy_attachment.cluster_ECRPullOnly
  ]

  tags = {
    Name        = "myekscluster-prod-node-group"
    Environment = "production"
  }
}



