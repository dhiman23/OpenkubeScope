#create IRSA for the EKSA ckuster so that the pods can assume the IAM role and access AWS resources
data "tls_certificate" "eks_cluster_cert" {
  url = aws_eks_cluster.eks_prod_cluster.identity[0].oidc[0].issuer
}
resource "aws_iam_openid_connect_provider" "eks_oidc_provider" {
  url = aws_eks_cluster.eks_prod_cluster.identity[0].oidc[0].issuer

  client_id_list = [
    "sts.amazonaws.com",
  ]

  thumbprint_list = [
    data.tls_certificate.eks_cluster_cert.certificates[0].sha1_fingerprint,
  ]
}
