// Slack notification dispatcher. Ported from lib/notifications.ts in the
// monolith. Change from the port: the webhook URL host is validated against
// hooks.slack.com before any request is made — closes the SSRF/data-exfil
// vector flagged in the codebase audit (an attacker-controlled webhook URL
// would otherwise receive full report contents from the server).

import type { ReportType, ReportFormat, ScanRiskCounts } from "./rbac-types"

export interface SlackReportSummary {
  reportName: string
  reportType: ReportType
  format: ReportFormat
  clusters: string[]
  status: "completed" | "failed"
  riskSummary: ScanRiskCounts
  errorMessage?: string | null
  workspaceName: string
}

export function isAllowedSlackWebhook(webhookUrl: string): boolean {
  try {
    const u = new URL(webhookUrl)
    return u.protocol === "https:" && u.hostname === "hooks.slack.com"
  } catch {
    return false
  }
}

function severityEmoji(count: number, critical: boolean): string {
  if (count === 0) return ":white_check_mark:"
  if (critical) return ":rotating_light:"
  return ":warning:"
}

export async function sendSlackReportNotification(webhookUrl: string, summary: SlackReportSummary): Promise<void> {
  if (!isAllowedSlackWebhook(webhookUrl)) {
    throw new Error("Refusing to send: webhook URL is not a https://hooks.slack.com address")
  }

  const base = process.env.PUBLIC_SITE_URL || ""
  const reportLink = base ? `${base}/app/reports` : null
  const risk = summary.riskSummary || { critical: 0, high: 0, medium: 0, low: 0 }
  const totalFindings = risk.critical + risk.high + risk.medium + risk.low

  const statusEmoji = summary.status === "failed" ? ":x:" : severityEmoji(risk.critical, true)
  const headerText = summary.status === "failed" ? `${statusEmoji} Report generation failed` : `${statusEmoji} KubeScope report ready: ${summary.reportName}`

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Workspace*\n${summary.workspaceName}` },
        { type: "mrkdwn", text: `*Type*\n${summary.reportType}` },
        { type: "mrkdwn", text: `*Clusters*\n${summary.clusters.join(", ") || "—"}` },
        { type: "mrkdwn", text: `*Format*\n${summary.format}` },
      ],
    },
  ]

  if (summary.status === "completed") {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Findings:* ${totalFindings}  ·  :red_circle: ${risk.critical} critical  ·  :large_orange_circle: ${risk.high} high  ·  :large_yellow_circle: ${risk.medium} medium  ·  :large_blue_circle: ${risk.low} low`,
      },
    })
  } else if (summary.status === "failed" && summary.errorMessage) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Error:*\n\`\`\`${summary.errorMessage}\`\`\`` },
    })
  }

  if (reportLink) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open in KubeScope", emoji: true },
          url: reportLink,
          style: "primary",
        },
      ],
    })
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: headerText, blocks }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Slack webhook failed (${res.status}): ${body}`)
  }
}
