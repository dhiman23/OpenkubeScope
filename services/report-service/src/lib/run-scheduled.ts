// Runs all due scheduled reports. Invoked by core-api's cron endpoint
// (Vercel cron -> core-api -> RunDueScheduledReports). Mirrors the monolith's
// app/api/cron/scheduled-reports route, but owns scheduling end-to-end here.

import { generateReport } from "./generate"
import { claimDueScheduledReports, computeNextRun, recordScheduledRun } from "./scheduled-repository"
import { sendSlackReportNotification, isAllowedSlackWebhook } from "./notifications"

export async function runDueScheduledReports(limit: number): Promise<{ processed: number; succeeded: number; failed: number }> {
  const due = await claimDueScheduledReports(limit > 0 ? limit : 50)

  let succeeded = 0
  let failed = 0

  for (const sched of due) {
    const nextRun = computeNextRun(sched.frequency).toISOString()
    try {
      const result = await generateReport({
        workspaceId: sched.workspace_id,
        workspaceName: sched.workspace_name,
        clusters: sched.clusters,
        reportType: sched.report_type,
        format: sched.format,
        reportName: sched.name,
      })

      if (result.status === "failed") {
        failed++
        await recordScheduledRun(sched.id, { status: "failed", error: result.errorMessage }, nextRun)
      } else {
        succeeded++
        await recordScheduledRun(sched.id, { status: "success", reportId: result.reportId }, nextRun)
      }

      // Best-effort Slack notification — never fails the run.
      if (sched.slack_webhook_url && isAllowedSlackWebhook(sched.slack_webhook_url)) {
        try {
          await sendSlackReportNotification(sched.slack_webhook_url, {
            reportName: sched.name,
            reportType: sched.report_type,
            format: sched.format,
            clusters: sched.clusters,
            status: result.status === "completed" ? "completed" : "failed",
            riskSummary: result.riskSummary,
            errorMessage: result.errorMessage || null,
            workspaceName: sched.workspace_name,
          })
        } catch (err) {
          console.error(`Slack notify failed for schedule ${sched.id}:`, err instanceof Error ? err.message : err)
        }
      }
    } catch (err) {
      failed++
      const message = err instanceof Error ? err.message : "Unknown error"
      await recordScheduledRun(sched.id, { status: "failed", error: message }, nextRun)
    }
  }

  return { processed: due.length, succeeded, failed }
}
