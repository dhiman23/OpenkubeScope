// SQS consumer for the event-driven scan flow:
//   core-api (producer) -> rbac_scan_queue -> this service -> Postgres.
// KEDA watches the queue depth and scales this Deployment; the consumer runs
// in the same process as the gRPC server, so keep minReplicaCount >= 1 in the
// ScaledObject (GetScan/ListScans must stay reachable).
//
// The message carries only ids — the raw snapshot bytes were persisted by the
// SubmitScan RPC (scans can be up to 32MB; SQS caps messages at 256KB).
// Long-polls one message at a time so queue depth maps directly to pending
// scans. Disabled unless SCAN_SQS_QUEUE_URL is set — local dev without AWS
// keeps using the synchronous ScanSnapshot RPC instead.
//
// Delivery semantics: the message is deleted only after the row reaches a
// terminal state (completed/failed). Parse/engine errors mark the row
// 'failed' and are terminal — the message is still deleted, no retry loop for
// bad input. Infrastructure errors (DB down, receive/delete failures) throw
// before a terminal state is recorded, so the message reappears after the
// queue's visibility timeout and is retried; after maxReceiveCount attempts
// SQS moves it to the DLQ (see infra/sqs.tf).

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs"
import { createScanFromBuffer } from "./rbac-engine"
import { getPendingScanJob, completePendingScan, failPendingScan } from "./scan-repository"

// Shape of the JSON body produced by core-api (src/lib/sqs.ts there).
export interface ScanJobMessage {
  version: number
  scanId: string
  workspaceId: string
}

let running = false
let stopped: Promise<void> | null = null

export function startSqsConsumer(): void {
  const queueUrl = process.env.SCAN_SQS_QUEUE_URL
  if (!queueUrl) {
    console.log("SCAN_SQS_QUEUE_URL not set — SQS consumer disabled, scans run via the ScanSnapshot RPC only")
    return
  }
  // Region + credentials come from the environment (AWS_REGION, IRSA web
  // identity token in-cluster, or the default provider chain locally).
  const client = new SQSClient({})
  running = true
  stopped = pollLoop(client, queueUrl)
  console.log(`SQS consumer polling ${queueUrl}`)
}

// Resolves once the in-flight scan (if any) is done and the loop exits.
export async function stopSqsConsumer(): Promise<void> {
  running = false
  await stopped
  stopped = null
}

async function pollLoop(client: SQSClient, queueUrl: string): Promise<void> {
  while (running) {
    try {
      const res = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        }),
      )
      for (const msg of res.Messages ?? []) {
        await handleMessage(msg.Body ?? "")
        if (msg.ReceiptHandle) {
          await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle }))
        }
      }
    } catch (err) {
      console.error("SQS poll failed:", err instanceof Error ? err.message : err)
      await sleep(5000)
    }
  }
  client.destroy()
}

async function handleMessage(body: string): Promise<void> {
  let job: ScanJobMessage
  try {
    job = JSON.parse(body)
  } catch {
    console.error("Dropping malformed SQS message (not JSON)")
    return
  }
  if (!job.scanId || !job.workspaceId) {
    console.error("Dropping invalid scan job:", job.scanId || "<no scan id>")
    return
  }

  const row = await getPendingScanJob(job.workspaceId, job.scanId)
  if (!row) {
    // Scan deleted between enqueue and processing — nothing to do.
    console.warn(`Scan ${job.scanId} not found, dropping job`)
    return
  }
  // Redelivery guard: skip jobs whose row already reached a terminal state.
  if (row.status !== "pending") return
  if (!row.rawSnapshot?.length) {
    await failPendingScan(job.workspaceId, job.scanId, "Raw snapshot missing for pending scan")
    return
  }

  console.log(`Scanning ${job.scanId} for workspace ${job.workspaceId}`)
  try {
    const scan = await createScanFromBuffer(Buffer.from(row.rawSnapshot), row.fileName)
    await completePendingScan(job.workspaceId, job.scanId, scan)
  } catch (err) {
    // Parse/engine failure — terminal for this snapshot, record it on the row.
    const message = err instanceof Error ? err.message : "Unknown error while scanning snapshot"
    await failPendingScan(job.workspaceId, job.scanId, message)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
