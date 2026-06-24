// Notification dispatcher for KubeScope.
// Currently supports Slack incoming webhooks. Email can plug in via Resend later.

import type { Report } from "@/lib/report-storage"

export interface SlackNotificationPayload {
  report: Report
  workspaceName: string
  siteUrl?: string
}

function severityEmoji(count: number, critical: boolean): string {
  if (count === 0) return ":white_check_mark:"
  if (critical) return ":rotating_light:"
  return ":warning:"
}

export async function sendSlackReportNotification(
  webhookUrl: string,
  { report, workspaceName, siteUrl }: SlackNotificationPayload
): Promise<void> {
  const base = siteUrl || process.env.NEXT_PUBLIC_SITE_URL || ""
  const reportLink = base ? `${base}/app/reports` : null
  const risk = report.risk_summary || { critical: 0, high: 0, medium: 0, low: 0 }
  const totalFindings = risk.critical + risk.high + risk.medium + risk.low

  const statusEmoji =
    report.status === "failed"
      ? ":x:"
      : severityEmoji(risk.critical, true)

  const headerText =
    report.status === "failed"
      ? `${statusEmoji} Report generation failed`
      : `${statusEmoji} KubeScope report ready: ${report.report_name}`

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Workspace*\n${workspaceName}` },
        { type: "mrkdwn", text: `*Type*\n${report.report_type}` },
        { type: "mrkdwn", text: `*Clusters*\n${report.clusters.join(", ") || "—"}` },
        { type: "mrkdwn", text: `*Format*\n${report.format}` },
      ],
    },
  ]

  if (report.status === "completed") {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Findings:* ${totalFindings}  ·  :red_circle: ${risk.critical} critical  ·  :large_orange_circle: ${risk.high} high  ·  :large_yellow_circle: ${risk.medium} medium  ·  :large_blue_circle: ${risk.low} low`,
      },
    })
  } else if (report.status === "failed" && report.error_message) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Error:*\n\`\`\`${report.error_message}\`\`\`` },
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
