// Scheduled reports. Rewired from Supabase to core-api (REST).

import type { Report } from "@/lib/report-storage"
import { scheduledReportsApi } from "./api-client"

export type ScheduleFrequency = "daily" | "weekly" | "monthly"

export interface ScheduledReport {
  id: string
  workspace_id: string
  name: string
  report_type: Report["report_type"]
  format: Report["format"]
  clusters: string[]
  frequency: ScheduleFrequency
  slack_webhook_url: string | null
  notify_email: string | null
  enabled: boolean
  next_run_at: string
  last_run_at: string | null
  last_run_status: "success" | "failed" | null
  last_run_error: string | null
  last_report_id: string | null
  created_at: string
  updated_at: string
}

// Display helper (server authoritatively computes the stored next_run_at).
export function computeNextRun(frequency: ScheduleFrequency, from: Date = new Date()): Date {
  const next = new Date(from)
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1)
      break
    case "weekly":
      next.setDate(next.getDate() + 7)
      break
    case "monthly":
      next.setMonth(next.getMonth() + 1)
      break
  }
  return next
}

export async function listScheduledReports(workspaceId: string): Promise<ScheduledReport[]> {
  try {
    return (await scheduledReportsApi.list(workspaceId)) as ScheduledReport[]
  } catch {
    return []
  }
}

export async function createScheduledReport(params: {
  workspace_id: string
  name: string
  report_type: Report["report_type"]
  format: Report["format"]
  clusters: string[]
  frequency: ScheduleFrequency
  slack_webhook_url?: string | null
  notify_email?: string | null
}): Promise<ScheduledReport> {
  return (await scheduledReportsApi.create(params.workspace_id, {
    name: params.name,
    reportType: params.report_type,
    format: params.format,
    clusters: params.clusters,
    frequency: params.frequency,
    slackWebhookUrl: params.slack_webhook_url ?? undefined,
    notifyEmail: params.notify_email ?? undefined,
  })) as ScheduledReport
}

export async function deleteScheduledReport(workspaceId: string, id: string): Promise<void> {
  await scheduledReportsApi.remove(workspaceId, id)
}

export async function toggleScheduledReport(workspaceId: string, id: string, enabled: boolean): Promise<void> {
  await scheduledReportsApi.toggle(workspaceId, id, enabled)
}
