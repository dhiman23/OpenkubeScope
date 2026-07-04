# SQS queue for RBAC scan requests.

# core-api publishes scan requests to this queue.

# rbac-scanner-service consumes messages from this queue.

# KEDA monitors the queue length and scales the rbac-scanner-service deployment.

resource "aws_sqs_queue" "rbac_scan_queue" {
  name                      = "rbac_scan_queue"
  message_retention_seconds = 86400
  visibility_timeout_seconds = 300
  receive_wait_time_seconds = 20
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.rbac_scan_dlq.arn
    maxReceiveCount     = 4
  })

tags = {
  Name        = "rbac_scan_queue"
  Project     = "OpenKubeScope"
  Environment = "production"
}

}
 
resource "aws_sqs_queue" "rbac_scan_dlq" {
  name = "rbac_scan_dlq"

  tags = {
    Name        = "rbac_scan_dlq"
    Environment = "production"
    Project     = "OpenKubeScope"
  }
}