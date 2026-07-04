// SQS producer. core-api is the publish-only side of the event-driven flow:
//   core-api -> rbac_scan_queue -> rbac-scanner-service (KEDA-scaled consumer).
// Its IRSA role needs only sqs:SendMessage on the queue; region + credentials
// come from the environment (AWS_REGION, IRSA in-cluster, default provider
// chain locally).
//
// Deliberately generic (queue URL is a parameter) so a later iteration can add
// a report-generation queue by defining another *_SQS_QUEUE_URL env var and a
// wrapper below — no refactoring of the send path.

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"

let client: SQSClient | null = null

async function sendQueueMessage(queueUrl: string, payload: Record<string, unknown>): Promise<void> {
  if (!client) client = new SQSClient({})
  await client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(payload) }))
}

// ---- RBAC scan queue ----

export function scanQueueUrl(): string | undefined {
  return process.env.SCAN_SQS_QUEUE_URL || undefined
}

// Matches ScanJobMessage in rbac-scanner-service's lib/sqs-consumer.ts. Only
// ids travel on the queue — the raw snapshot was already persisted via the
// SubmitScan RPC (snapshots can be 32MB; SQS caps messages at 256KB).
export async function enqueueScanJob(job: { scanId: string; workspaceId: string }): Promise<void> {
  const queueUrl = scanQueueUrl()
  if (!queueUrl) throw new Error("SCAN_SQS_QUEUE_URL is not configured")
  await sendQueueMessage(queueUrl, { version: 1, ...job })
}
