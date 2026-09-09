// SQS producer. core-api is the publish-only side of the event-driven flow:
//   core-api -> rbac_scan_queue -> rbac-scanner-service (KEDA-scaled consumer).
// Its IRSA role needs only sqs:SendMessage on the queue; region + credentials
// come from the environment (AWS_REGION, IRSA in-cluster, default provider
// chain locally).
//
// Deliberately generic (queue URL is a parameter) so a later iteration can add
// a report-generation queue by defining another *_SQS_QUEUE_URL env var and a
// wrapper below — no refactoring of the send path.

import { SQSClient, SendMessageCommand, type MessageAttributeValue } from "@aws-sdk/client-sqs"
import { context, propagation } from "@opentelemetry/api"

let client: SQSClient | null = null

// A queue is a hole in a distributed trace: the consumer runs in another pod,
// minutes later, with no HTTP or gRPC call to carry context. W3C trace context
// travels as message attributes instead, so rbac-scanner-service can attach its
// work to the request that caused it (see extractTraceContext() in that
// service's lib/sqs-consumer.ts). Two attributes, well under the SQS limit of
// 10; the aws-sdk instrumentation may inject the same keys, which is harmless.
function traceContextAttributes(): Record<string, MessageAttributeValue> {
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)

  const attributes: Record<string, MessageAttributeValue> = {}
  for (const [key, value] of Object.entries(carrier)) {
    attributes[key] = { DataType: "String", StringValue: value }
  }
  return attributes
}

async function sendQueueMessage(queueUrl: string, payload: Record<string, unknown>): Promise<void> {
  if (!client) client = new SQSClient({})
  await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
      MessageAttributes: traceContextAttributes(),
    }),
  )
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
