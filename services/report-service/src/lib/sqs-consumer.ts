// SQS consumer for async report-generation jobs (core-api is the producer).
// Long-polls one message at a time so KEDA's queue-depth scaling maps directly
// to pending jobs. Disabled unless SQS_QUEUE_URL is set — local dev without
// AWS keeps using the synchronous GenerateReport RPC path instead.
//
// Delivery semantics: the message is deleted only after generateReport()
// returns. generateReport records completed/failed on the report row itself
// and does not throw for generation errors, so those are terminal (no
// pointless retries). A crash mid-job leaves the message invisible until the
// queue's visibility timeout expires, after which it is redelivered; the
// status guard below makes redelivery a no-op if the row already finished.

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs"
import { generateReport } from "./generate"
import { getReport } from "./report-repository"
import type { ReportType, ReportFormat } from "./rbac-types"

// Shape of the JSON body produced by core-api (lib/report-queue.ts there).
export interface ReportJobMessage {
  version: number
  reportId: string
  workspaceId: string
  workspaceName: string
  clusters: string[]
  reportType: ReportType
  format: ReportFormat
  reportName: string
  scanIds: string[]
}

const REPORT_TYPES: ReadonlySet<string> = new Set(["COMPLIANCE", "RISK_ASSESSMENT", "RBAC_AUDIT", "TREND_ANALYSIS"])
const REPORT_FORMATS: ReadonlySet<string> = new Set(["PDF", "JSON", "CSV"])

let running = false
let stopped: Promise<void> | null = null

export function startSqsConsumer(): void {
  const queueUrl = process.env.SQS_QUEUE_URL
  if (!queueUrl) {
    console.log("SQS_QUEUE_URL not set — SQS consumer disabled, reports generate via the GenerateReport RPC only")
    return
  }
  // Region + credentials come from the environment (AWS_REGION, IRSA web
  // identity token in-cluster, or the default provider chain locally).
  const client = new SQSClient({})
  running = true
  stopped = pollLoop(client, queueUrl)
  console.log(`SQS consumer polling ${queueUrl}`)
}

// Resolves once the in-flight message (if any) is done and the loop exits.
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
      // Covers receive/delete failures and DB errors thrown before generation
      // starts — the message stays on the queue and is redelivered.
      console.error("SQS poll failed:", err instanceof Error ? err.message : err)
      await sleep(5000)
    }
  }
  client.destroy()
}

async function handleMessage(body: string): Promise<void> {
  let job: ReportJobMessage
  try {
    job = JSON.parse(body)
  } catch {
    console.error("Dropping malformed SQS message (not JSON)")
    return
  }
  if (!job.reportId || !job.workspaceId || !Array.isArray(job.clusters) || job.clusters.length === 0) {
    console.error("Dropping invalid report job:", job.reportId || "<no report id>")
    return
  }

  // Redelivery guard: skip jobs whose report row already finished.
  const existing = await getReport(job.workspaceId, job.reportId)
  if (existing && existing.status !== "generating") return

  console.log(`Generating report ${job.reportId} for workspace ${job.workspaceId}`)
  await generateReport({
    reportId: job.reportId,
    workspaceId: job.workspaceId,
    workspaceName: job.workspaceName || "",
    clusters: job.clusters,
    reportType: REPORT_TYPES.has(job.reportType) ? job.reportType : "RBAC_AUDIT",
    format: REPORT_FORMATS.has(job.format) ? job.format : "JSON",
    reportName: job.reportName || "Report",
    scanIds: Array.isArray(job.scanIds) ? job.scanIds : [],
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
