// SQS producer for async report-generation jobs. When SQS_QUEUE_URL is set,
// the reports route creates the row via the CreateReport RPC (so it shows up
// as 'generating' immediately) and enqueues the heavy work here; report-service
// consumes the queue, with KEDA scaling its replicas on queue depth. When
// unset (local dev without AWS), the route falls back to the synchronous
// GenerateReport RPC.

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"

// Matches ReportJobMessage in report-service's lib/sqs-consumer.ts.
export interface ReportJob {
  reportId: string
  workspaceId: string
  workspaceName: string
  clusters: string[]
  reportType: string
  format: string
  reportName: string
  scanIds: string[]
}

let client: SQSClient | null = null

export function reportQueueUrl(): string | undefined {
  return process.env.SQS_QUEUE_URL || undefined
}

export async function enqueueReportJob(job: ReportJob): Promise<void> {
  const queueUrl = reportQueueUrl()
  if (!queueUrl) throw new Error("SQS_QUEUE_URL is not configured")
  if (!client) {
    // Region + credentials from the environment (AWS_REGION, IRSA in-cluster).
    client = new SQSClient({})
  }
  await client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify({ version: 1, ...job }) }))
}
