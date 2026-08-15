"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Download, FileText, GitCompare, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { getTimeAgo } from "@/lib/format-utils"
import { useScan } from "@/components/scan/scan-context"
import { ScoreRing } from "@/components/posture/score-ring"
import { TrendDelta } from "@/components/posture/trend-delta"
import { deleteReport, downloadReport, generateReport, loadReports, type Report } from "@/lib/report-storage"
import { ProvenanceLine } from "@/components/reports/report-provenance"
import { describeScope, namespaceStats } from "@/lib/namespaces"

const REPORT_TYPES: { value: Report["report_type"]; label: string; description: string }[] = [
  { value: "RISK_ASSESSMENT", label: "Risk assessment", description: "Findings by severity with remediation." },
  { value: "COMPLIANCE", label: "Compliance", description: "CIS control pass/fail with offending objects." },
  { value: "RBAC_AUDIT", label: "RBAC audit", description: "Full inventory of subjects, roles and bindings." },
  { value: "TREND_ANALYSIS", label: "Trend analysis", description: "Posture over time for this cluster." },
]

export default function ScanReportsPage() {
  const { scan, scanId, workspaceId, clusterName, score, previousScore, previous, compliance } = useScan()
  const { toast } = useToast()

  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const all = await loadReports(workspaceId)
    // Only reports built from this snapshot belong on a scan-scoped page.
    setReports(all.filter((report) => (report.scan_ids ?? []).includes(scanId)))
    setLoading(false)
  }, [workspaceId, scanId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleGenerate = async (type: Report["report_type"], format: Report["format"]) => {
    setGenerating(type)
    try {
      await generateReport(workspaceId, {
        report_name: `${clusterName} — ${REPORT_TYPES.find((t) => t.value === type)?.label}`,
        report_type: type,
        format,
        clusters: [clusterName],
        // Bind the report to THIS snapshot, not to whatever is newest.
        scan_ids: [scanId],
        filters: ["All findings", describeScope(namespaceStats(scan.dataset))],
      })
      toast({ description: "Report generated." })
      await refresh()
    } catch (error) {
      toast({
        title: "Report generation failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setGenerating(null)
    }
  }

  const scoreDelta = previousScore ? score.score - previousScore.score : null
  const criticalDelta = previous
    ? (scan.riskCounts?.critical ?? 0) - (previous.riskCounts?.critical ?? 0)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every report on this page is generated from this snapshot of {clusterName} — snapshot{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{scanId.slice(0, 8)}</code>, captured{" "}
          {new Date(scan.createdAt).toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          . Its numbers will match what you see on the dashboard.
        </p>
      </div>

      {/* Posture summary every report carries — a report card that shows only a
          filename tells a reader nothing. */}
      <div className="data-card p-5">
        <h2 className="text-lg font-semibold mb-4">Snapshot summary</h2>
        <div className="flex items-center gap-8 flex-wrap">
          <div className="flex items-center gap-3">
            <ScoreRing score={score.score} size="lg" />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Security score</p>
              <TrendDelta delta={scoreDelta} baselineLabel={previous ? getTimeAgo(previous.createdAt) : undefined} />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Compliance</p>
            <p className="text-2xl font-semibold tabular">{compliance.percentage}%</p>
            <p className="text-xs text-muted-foreground">
              {compliance.passed}/{compliance.total} controls
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Critical</p>
            <p className="text-2xl font-semibold tabular text-sev-critical">{scan.riskCounts?.critical ?? 0}</p>
            <TrendDelta delta={criticalDelta} higherIsWorse />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Risk delta</p>
            {previous ? (
              <>
                <p
                  className={cn(
                    "text-2xl font-semibold tabular",
                    (scoreDelta ?? 0) > 0 ? "text-sev-pass" : (scoreDelta ?? 0) < 0 ? "text-sev-high" : "",
                  )}
                >
                  {(scoreDelta ?? 0) > 0 ? "+" : ""}
                  {scoreDelta ?? 0}
                </p>
                <Link
                  href={`/app/scans/${scanId}/compare/${previous.id}`}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <GitCompare className="w-3 h-3" />
                  View diff
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">No baseline yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Generate */}
      <div className="data-card p-5">
        <h2 className="text-lg font-semibold mb-4">Generate a report</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {REPORT_TYPES.map((type) => (
            <div key={type.value} className="rounded-xl border border-border p-4">
              <p className="font-medium">{type.label}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{type.description}</p>
              <div className="mt-3 flex gap-2">
                {(["PDF", "CSV", "JSON"] as const).map((format) => (
                  <Button
                    key={format}
                    variant="outline"
                    size="sm"
                    className="rounded-xl bg-transparent"
                    disabled={generating !== null}
                    onClick={() => handleGenerate(type.value, format)}
                  >
                    {generating === type.value ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : format}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Existing reports */}
      <div className="data-card p-5">
        <h2 className="text-lg font-semibold mb-3">Reports for this snapshot</h2>

        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reports generated from this snapshot yet.{" "}
            <Link href="/app/reports" className="text-primary hover:underline">
              See the workspace report library
            </Link>
            .
          </p>
        ) : (
          <div className="divide-y divide-border">
            {reports.map((report) => (
              <div key={report.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="p-2 rounded-lg bg-muted shrink-0">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{report.report_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {report.format} · generated {getTimeAgo(report.created_at)}
                    {report.file_size && ` · ${report.file_size}`}
                  </p>
                  {/* Which snapshot this report actually describes. */}
                  <ProvenanceLine provenance={report.provenance} className="mt-1" />
                </div>

                {report.status === "failed" ? (
                  <span className="text-xs text-sev-critical">{report.error_message || "Failed"}</span>
                ) : report.status === "generating" ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl bg-transparent"
                    title={`Download ${report.report_name} as ${report.format}`}
                    onClick={() => downloadReport(workspaceId, report.id, report.report_name)}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                    Download {report.format}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await deleteReport(workspaceId, report.id)
                    await refresh()
                  }}
                  aria-label={`Delete report ${report.report_name}`}
                  title="Delete report"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
