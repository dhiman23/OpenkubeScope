output "cluster_issuer_url" {
  value = aws_eks_cluster.eks_prod_cluster.identity[0].oidc[0].issuer
}

# Inject as SCAN_SQS_QUEUE_URL into core-api (producer) and rbac-scanner-service (consumer).
output "rbac_scan_queue_url" {
  value = aws_sqs_queue.rbac_scan_queue.url
}