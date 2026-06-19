// Cron endpoint for executing due scheduled reports.
// Wire to Vercel Cron (vercel.json) or invoke externally with the CRON_SECRET header.

import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { computeNextRun } from "@/lib/scheduled-reports"
import type { ScheduledReport } from "@/lib/scheduled-reports"
import { sendSlackReportNotification } from "@/lib/notifications"
import type { Report } from "@/lib/report-storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get("authorization") || ""
  const expected = `Bearer ${secret}`
  // Vercel Cron sends "Bearer <CRON_SECRET>"
  if (header === expected) return true
  // Also accept x-cron-secret for manual/CI triggers
  if (req.headers.get("x-cron-secret") === secret) return true
  return false
}

async function runOneSchedule(
  supabase: ReturnType<typeof createServiceClient>,
  schedule: ScheduledReport
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Create a report row in status=generating
    const { data: created, error: insertErr } = await supabase
      .from("reports")
      .insert({
        workspace_id: schedule.workspace_id,
        scan_ids: [],
        report_name: `${schedule.name} - ${new Date().toISOString().slice(0, 10)}`,
        report_type: schedule.report_type,
        format: schedule.format,
        clusters: schedule.clusters,
        status: "generating",
      })
      .select()
      .single()

    if (insertErr || !created) {
      throw new Error(insertErr?.message || "Failed to insert report row")
    }

    const report = created as Report

    // Note: the client-side `generateReport()` assembles ReportData from scans and
    // calls updateReport. For the cron path we mirror the core aggregation here
    // using the service client so it runs without a browser.
    await generateReportServerSide(supabase, report)

    // Re-fetch the updated report for notifications
    const { data: finalReport } = await supabase
      .from("reports")
      .select("*")
      .eq("id", report.id)
      .single()

    const reportForNotify = (finalReport || report) as Report

    // Send Slack notification if configured
    if (schedule.slack_webhook_url) {
      try {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("name")
          .eq("id", schedule.workspace_id)
          .single()

        await sendSlackReportNotification(schedule.slack_webhook_url, {
          report: reportForNotify,
          workspaceName: (ws as { name?: string } | null)?.name || "Workspace",
        })
      } catch (slackErr) {
        console.error("Slack notification failed:", slackErr)
      }
    }

    // Advance schedule
    const nextRun = computeNextRun(schedule.frequency).toISOString()
    await supabase
      .from("scheduled_reports")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: "success",
        last_run_error: null,
        last_report_id: report.id,
        next_run_at: nextRun,
      })
      .eq("id", schedule.id)

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const nextRun = computeNextRun(schedule.frequency).toISOString()
    await supabase
      .from("scheduled_reports")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: "failed",
        last_run_error: message,
        next_run_at: nextRun,
      })
      .eq("id", schedule.id)
    return { ok: false, error: message }
  }
}

// Minimal server-side report generator that mirrors lib/report-generator.ts
// aggregation but runs with the service client. Keeps client-side lib untouched.
async function generateReportServerSide(
  supabase: ReturnType<typeof createServiceClient>,
  report: Report
): Promise<void> {
  const { data: scans, error } = await supabase
    .from("scans")
    .select("*")
    .eq("workspace_id", report.workspace_id)
    .in("cluster_name", report.clusters)
    .order("created_at", { ascending: false })

  if (error) throw new Error(`Failed to fetch scans: ${error.message}`)

  const rows = (scans || []) as Array<{
    id: string
    cluster_name: string
    scan_data: Record<string, unknown>
    totals: { subjects?: number; roles?: number; bindings?: number }
    risk_counts: { critical?: number; high?: number; medium?: number; low?: number }
    created_at: string
  }>

  // Latest per cluster
  const latest = new Map<string, typeof rows[0]>()
  for (const r of rows) {
    if (!latest.has(r.cluster_name)) latest.set(r.cluster_name, r)
  }

  if (latest.size === 0) {
    await supabase
      .from("reports")
      .update({
        status: "failed",
        error_message: "No scans found for the selected clusters",
      })
      .eq("id", report.id)
    return
  }

  const totals = { subjects: 0, roles: 0, bindings: 0 }
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const scan of latest.values()) {
    totals.subjects += scan.totals?.subjects || 0
    totals.roles += scan.totals?.roles || 0
    totals.bindings += scan.totals?.bindings || 0
    riskCounts.critical += scan.risk_counts?.critical || 0
    riskCounts.high += scan.risk_counts?.high || 0
    riskCounts.medium += scan.risk_counts?.medium || 0
    riskCounts.low += scan.risk_counts?.low || 0
  }

  // Store a minimal report_data payload — the client will rebuild full PDF/CSV on download.
  const reportData = {
    workspace_id: report.workspace_id,
    clusters: report.clusters,
    report_type: report.report_type,
    format: report.format,
    generated_at: new Date().toISOString(),
    summary: totals,
    risks: riskCounts,
    findings: [],
    rbac_rows: [],
    scheduled: true,
  }

  await supabase
    .from("reports")
    .update({
      status: "completed",
      risk_summary: riskCounts,
      report_data: reportData,
      file_size: null,
    })
    .eq("id", report.id)
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { data: due, error } = await supabase
    .from("scheduled_reports")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", now)
    .limit(25)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const schedules = (due || []) as ScheduledReport[]
  const results: Array<{ id: string; ok: boolean; error?: string }> = []

  for (const schedule of schedules) {
    const res = await runOneSchedule(supabase, schedule)
    results.push({ id: schedule.id, ...res })
  }

  return NextResponse.json({
    ran: schedules.length,
    results,
    at: now,
  })
}

// Allow POST for platforms that don't support GET cron triggers.
export async function POST(req: NextRequest) {
  return GET(req)
}
