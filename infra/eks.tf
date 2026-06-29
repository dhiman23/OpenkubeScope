
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
    endpoint_private_access = true
    endpoint_public_access = false
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

#create an instance profile for the EKS node group
resource "aws_iam_instance_profile" "eks_prod_instance_profile" {
  name = "eks-prod-instance-profile"
  role = aws_iam_role.node_group.name
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

# Amazon SSM parameter to get the latest EKS optimized recommended AMI ID for the specified Kubernetes version and OS type. This parameter is used to ensure that the EKS node group uses the latest recommended AMI for optimal performance and security.

data "aws_ssm_parameter" "eks_worker_image_id" {
  name = "/aws/service/eks/optimized-ami/1.35/amazon-linux-2023/x86_64/standard/recommended/image_id"

}

#launch template for the EKS node group
resource "aws_launch_template" "eks_prod_launch_template" {
  name_prefix   = "myekscluster-prod-launch-template"
  image_id      = data.aws_ssm_parameter.eks_worker_image_id.value
  instance_type = "t3.medium"
  key_name     = "us-1"

  iam_instance_profile {
    name = aws_iam_instance_profile.eks_prod_instance_profile.name
  }

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name        = "myekscluster-prod-instance"
      Environment = "production"
    }
  }

  metadata_options {
    http_tokens = "required"
    http_endpoint = "enabled"
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 35
      volume_type = "gp3"
      delete_on_termination = true
      encrypted = true
    }

  }
  monitoring {
    enabled = true
  }
}



