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

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, type Message } from "@aws-sdk/client-sqs"
import { ROOT_CONTEXT, SpanKind, SpanStatusCode, context, propagation, type Span } from "@opentelemetry/api"
import { createScanFromBuffer } from "./rbac-engine"
import { getPendingScanJob, completePendingScan, failPendingScan } from "./scan-repository"
import { log } from "./logger"
import { tracer } from "./tracing"

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
    log.info("SCAN_SQS_QUEUE_URL not set — SQS consumer disabled, scans run via the ScanSnapshot RPC only")
    return
  }
  // Region + credentials come from the environment (AWS_REGION, IRSA web
  // identity token in-cluster, or the default provider chain locally).
  const client = new SQSClient({})
  running = true
  stopped = pollLoop(client, queueUrl)
  log.info("SQS consumer polling", { queue: queueName(queueUrl) })
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
          // Without this the trace context the producer attached never comes
          // back from SQS and every scan starts its own orphan trace.
          MessageAttributeNames: ["All"],
        }),
      )
      for (const msg of res.Messages ?? []) {
        await processMessage(client, queueUrl, msg)
      }
    } catch (err) {
      log.error("SQS poll failed", { error: err instanceof Error ? err.message : String(err) })
      await sleep(5000)
    }
  }
  client.destroy()
}

function queueName(queueUrl: string): string {
  return queueUrl.split("/").pop() || "rbac_scan_queue"
}

// The producer (core-api's lib/sqs.ts) put W3C trace context in the message
// attributes. Extracting it here makes the scan a child of the HTTP request
// that uploaded the snapshot, so one trace covers upload -> queue -> engine ->
// DB instead of two unconnected ones. Time spent waiting in the queue becomes
// the visible gap between the producer's send span and this one.
function extractTraceContext(msg: Message) {
  const carrier: Record<string, string> = {}
  for (const [key, value] of Object.entries(msg.MessageAttributes ?? {})) {
    // SQS echoes attribute names in the case they were sent; the W3C
    // propagator only looks for lowercase keys.
    if (value?.StringValue) carrier[key.toLowerCase()] = value.StringValue
  }
  return propagation.extract(ROOT_CONTEXT, carrier)
}

// One span per message, covering the scan and the delete that follows it. A
// message stuck in a redelivery loop shows up as repeated spans on the same
// scan id, which is otherwise hard to see from queue metrics alone.
async function processMessage(client: SQSClient, queueUrl: string, msg: Message): Promise<void> {
  await context.with(extractTraceContext(msg), () =>
    tracer.startActiveSpan(
      `${queueName(queueUrl)} process`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          "messaging.system": "aws_sqs",
          "messaging.operation": "process",
          "messaging.destination.name": queueName(queueUrl),
          "messaging.message.id": msg.MessageId ?? "",
        },
      },
      async (span) => {
        try {
          span.setAttribute("scan.outcome", await handleMessage(msg.Body ?? "", span))
          if (msg.ReceiptHandle) {
            await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle }))
          }
        } catch (err) {
          // Infrastructure failure: no terminal state was recorded, so the
          // message must go back on the queue. Rethrow to pollLoop's backoff.
          span.recordException(err instanceof Error ? err : new Error(String(err)))
          span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) })
          throw err
        } finally {
          span.end()
        }
      },
    ),
  )
}

// Returns what happened to the message, recorded on the span as scan.outcome:
// completed/failed are terminal for the scan row, dropped/skipped mean there
// was nothing left to do.
type ScanOutcome = "completed" | "failed" | "dropped" | "skipped"

async function handleMessage(body: string, span: Span): Promise<ScanOutcome> {
  let job: ScanJobMessage
  try {
    job = JSON.parse(body)
  } catch {
    log.error("Dropping malformed SQS message (not JSON)")
    return "dropped"
  }
  if (!job.scanId || !job.workspaceId) {
    log.error("Dropping invalid scan job", { scan_id: job.scanId ?? null })
    return "dropped"
  }

  span.setAttributes({ "scan.id": job.scanId, "workspace.id": job.workspaceId })

  const row = await getPendingScanJob(job.workspaceId, job.scanId)
  if (!row) {
    // Scan deleted between enqueue and processing — nothing to do.
    log.warn("Scan not found, dropping job", { scan_id: job.scanId })
    return "dropped"
  }
  // Redelivery guard: skip jobs whose row already reached a terminal state.
  if (row.status !== "pending") return "skipped"
  if (!row.rawSnapshot?.length) {
    await failPendingScan(job.workspaceId, job.scanId, "Raw snapshot missing for pending scan")
    return "failed"
  }

  log.info("Scanning snapshot", {
    scan_id: job.scanId,
    workspace_id: job.workspaceId,
    snapshot_bytes: row.rawSnapshot.length,
  })
  try {
    const scan = await createScanFromBuffer(Buffer.from(row.rawSnapshot), row.fileName)
    await completePendingScan(job.workspaceId, job.scanId, scan)
    return "completed"
  } catch (err) {
    // Parse/engine failure — terminal for this snapshot, record it on the row.
    const message = err instanceof Error ? err.message : "Unknown error while scanning snapshot"
    span.recordException(err instanceof Error ? err : new Error(message))
    await failPendingScan(job.workspaceId, job.scanId, message)
    return "failed"
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
