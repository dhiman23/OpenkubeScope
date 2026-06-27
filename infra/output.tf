 output "cluster_issuer_url" {
    value = aws_eks_cluster.eks_prod_cluster.identity[0].oidc[0].issuer
  }