// Owns report.scheduled_reports. Ported from lib/scheduled-reports.ts (Supabase)
// to raw pg. computeNextRun is unchanged pure logic.

import { getPool } from "./db"
import type { ReportType, ReportFormat } from "./rbac-types"
import type { ScheduleFrequencyStr } from "./enums"

export interface ScheduledReportRow {
  id: string
  workspace_id: string
  workspace_name: string
  name: string
  report_type: ReportType
  format: ReportFormat
  clusters: string[]
  frequency: ScheduleFrequencyStr
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

export function computeNextRun(frequency: ScheduleFrequencyStr, from: Date = new Date()): Date {
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

export async function listScheduledReports(workspaceId: string): Promise<ScheduledReportRow[]> {
  const pool = getPool()
  const { rows } = await pool.query<ScheduledReportRow>(
    `SELECT * FROM report.scheduled_reports WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId],
  )
  return rows
}

export async function createScheduledReport(params: {
  workspaceId: string
  workspaceName: string
  name: string
  reportType: ReportType
  format: ReportFormat
  clusters: string[]
  frequency: ScheduleFrequencyStr
  slackWebhookUrl?: string | null
  notifyEmail?: string | null
}): Promise<ScheduledReportRow> {
  const pool = getPool()
  const nextRun = computeNextRun(params.frequency).toISOString()

  const { rows } = await pool.query<ScheduledReportRow>(
    `INSERT INTO report.scheduled_reports
       (workspace_id, workspace_name, name, report_type, format, clusters, frequency, slack_webhook_url, notify_email, enabled, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)
     RETURNING *`,
    [
      params.workspaceId,
      params.workspaceName,
      params.name,
      params.reportType,
      params.format,
      params.clusters,
      params.frequency,
      params.slackWebhookUrl || null,
      params.notifyEmail || null,
      nextRun,
    ],
  )
  return rows[0]
}

export async function deleteScheduledReport(workspaceId: string, id: string): Promise<boolean> {
  const pool = getPool()
  const result = await pool.query(`DELETE FROM report.scheduled_reports WHERE workspace_id = $1 AND id = $2`, [workspaceId, id])
  return (result.rowCount ?? 0) > 0
}

export async function toggleScheduledReport(workspaceId: string, id: string, enabled: boolean): Promise<ScheduledReportRow | null> {
  const pool = getPool()
  const { rows } = await pool.query<ScheduledReportRow>(
    `UPDATE report.scheduled_reports SET enabled = $3 WHERE workspace_id = $1 AND id = $2 RETURNING *`,
    [workspaceId, id, enabled],
  )
  return rows[0] || null
}

// Claim due schedules (enabled, next_run_at <= now). Returns the rows and
// advances their next_run_at so concurrent cron invocations don't double-run.
export async function claimDueScheduledReports(limit: number): Promise<ScheduledReportRow[]> {
  const pool = getPool()
  const { rows } = await pool.query<ScheduledReportRow>(
    `SELECT * FROM report.scheduled_reports
      WHERE enabled = TRUE AND next_run_at <= NOW()
      ORDER BY next_run_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED`,
    [limit],
  )
  return rows
}

export async function recordScheduledRun(
  id: string,
  result: { status: "success" | "failed"; error?: string | null; reportId?: string | null },
  nextRunAt: string,
): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE report.scheduled_reports
        SET last_run_at = NOW(), last_run_status = $2, last_run_error = $3, last_report_id = $4, next_run_at = $5
      WHERE id = $1`,
    [id, result.status, result.error || null, result.reportId || null, nextRunAt],
  )
}
