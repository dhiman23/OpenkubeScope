// Owns report.reports. Ported from lib/report-storage.ts (Supabase) to raw pg.
// All queries scoped by workspace_id (no RLS at this layer). Ports
// createReport/updateReport/loadReports/getReport/deleteReport.

import { getPool } from "./db"
import type { ReportData } from "./report-engine"
import type { ReportType, ReportFormat, ReportStatusStr, ScanRiskCounts } from "./rbac-types"

export interface ReportRow {
  id: string
  workspace_id: string
  scan_ids: string[]
  report_name: string
  report_type: ReportType
  format: ReportFormat
  clusters: string[]
  status: ReportStatusStr
  risk_summary: ScanRiskCounts
  report_data: ReportData | null
  file_content: string | null // base64
  file_size: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export async function createReport(params: {
  workspaceId: string
  scanIds: string[]
  reportName: string
  reportType: ReportType
  format: ReportFormat
  clusters: string[]
  reportId?: string
}): Promise<ReportRow> {
  const pool = getPool()

  // Allow caller-supplied id (scheduled runs) via explicit insert; otherwise DB default.
  const { rows } = await pool.query<ReportRow>(
    `INSERT INTO report.reports
       (id, workspace_id, scan_ids, report_name, report_type, format, clusters, status)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, 'generating')
     RETURNING *`,
    [params.reportId || null, params.workspaceId, params.scanIds, params.reportName, params.reportType, params.format, params.clusters],
  )

  return rows[0]
}

export async function completeReport(
  reportId: string,
  updates: { riskSummary: ScanRiskCounts; reportData: ReportData; fileContent: string; fileSize: string },
): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE report.reports
        SET status = 'completed', risk_summary = $2, report_data = $3, file_content = $4, file_size = $5, error_message = NULL
      WHERE id = $1`,
    [reportId, JSON.stringify(updates.riskSummary), JSON.stringify(updates.reportData), updates.fileContent, updates.fileSize],
  )
}

export async function failReport(reportId: string, errorMessage: string): Promise<void> {
  const pool = getPool()
  await pool.query(`UPDATE report.reports SET status = 'failed', error_message = $2 WHERE id = $1`, [reportId, errorMessage])
}

export async function listReports(workspaceId: string): Promise<ReportRow[]> {
  const pool = getPool()
  // Exclude the heavy report_data / file_content columns from list views.
  const { rows } = await pool.query<ReportRow>(
    `SELECT id, workspace_id, scan_ids, report_name, report_type, format, clusters, status,
            risk_summary, NULL::jsonb AS report_data, NULL AS file_content, file_size, error_message, created_at, updated_at
       FROM report.reports
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId],
  )
  return rows
}

export async function getReport(workspaceId: string, reportId: string): Promise<ReportRow | null> {
  const pool = getPool()
  const { rows } = await pool.query<ReportRow>(`SELECT * FROM report.reports WHERE workspace_id = $1 AND id = $2`, [workspaceId, reportId])
  return rows[0] || null
}

export async function deleteReport(workspaceId: string, reportId: string): Promise<boolean> {
  const pool = getPool()
  const result = await pool.query(`DELETE FROM report.reports WHERE workspace_id = $1 AND id = $2`, [workspaceId, reportId])
  return (result.rowCount ?? 0) > 0
}

// Returns the stored file bytes (decoded from base64) for re-download, or null.
export async function getReportFile(
  workspaceId: string,
  reportId: string,
): Promise<{ content: Buffer; format: ReportFormat; reportName: string; fileSize: string; status: ReportStatusStr; errorMessage: string | null } | null> {
  const pool = getPool()
  const { rows } = await pool.query<{ file_content: string | null; format: ReportFormat; report_name: string; file_size: string | null; status: ReportStatusStr; error_message: string | null }>(
    `SELECT file_content, format, report_name, file_size, status, error_message
       FROM report.reports WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, reportId],
  )
  const row = rows[0]
  if (!row) return null
  return {
    content: row.file_content ? Buffer.from(row.file_content, "base64") : Buffer.alloc(0),
    format: row.format,
    reportName: row.report_name,
    fileSize: row.file_size || "",
    status: row.status,
    errorMessage: row.error_message,
  }
}
