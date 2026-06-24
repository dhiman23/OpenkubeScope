// Scheduled Reports storage & scheduling logic for KubeScope.

import { createClient } from "@/lib/supabase/client"
import type { Report } from "@/lib/report-storage"

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
  const supabase = createClient()
  const { data, error } = await supabase
    .from("scheduled_reports")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Failed to list scheduled reports:", error.message)
    return []
  }
  return (data as ScheduledReport[]) || []
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
  const supabase = createClient()
  const nextRun = computeNextRun(params.frequency).toISOString()

  const { data, error } = await supabase
    .from("scheduled_reports")
    .insert({
      workspace_id: params.workspace_id,
      name: params.name,
      report_type: params.report_type,
      format: params.format,
      clusters: params.clusters,
      frequency: params.frequency,
      slack_webhook_url: params.slack_webhook_url || null,
      notify_email: params.notify_email || null,
      enabled: true,
      next_run_at: nextRun,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create scheduled report: ${error.message}`)
  return data as ScheduledReport
}

export async function deleteScheduledReport(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("scheduled_reports").delete().eq("id", id)
  if (error) throw new Error(`Failed to delete scheduled report: ${error.message}`)
}

export async function toggleScheduledReport(id: string, enabled: boolean): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from("scheduled_reports")
    .update({ enabled })
    .eq("id", id)
  if (error) throw new Error(`Failed to toggle scheduled report: ${error.message}`)
}
