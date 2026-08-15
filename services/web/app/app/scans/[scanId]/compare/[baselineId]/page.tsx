"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Download, Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useScan } from "@/components/scan/scan-context"
import { SeverityBadge } from "@/components/posture/severity"
import { getScan } from "@/lib/scan-storage"
import { diffScans, type ScanDiff } from "@/lib/scan-diff"
import { downloadCsv } from "@/lib/export"
import { clusterIdFor, clusterNameForScan } from "@/lib/clusters"
import type { Scan } from "@/lib/rbac-scanner"

export default function ComparePage() {
  const { scan, scanId, workspaceId, allScans, clusterName } = useScan()
  const params = useParams<{ baselineId: string }>()
  const router = useRouter()
  const baselineId = params?.baselineId

  const [baseline, setBaseline] = useState<Scan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const result = baselineId ? await getScan(workspaceId, baselineId) : null
      if (cancelled) return
      setBaseline(result)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId, baselineId])

  const diff = useMemo<ScanDiff | null>(
    () => (baseline ? diffScans(baseline, scan) : null),
    [baseline, scan],
  )

  const siblings = useMemo(() => {
    const clusterId = clusterIdFor(clusterName)
    return allScans
      .filter((s) => clusterIdFor(clusterNameForScan(s)) === clusterId && s.id !== scanId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [allScans, clusterName, scanId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    )
  }

  if (!baseline || !diff) {
    return (
      <div className="data-card p-10 text-center">
        <p className="font-medium">Baseline snapshot not found</p>
        <Link href={`/app/scans/${scanId}/compare`}>
          <Button className="mt-5 rounded-xl">Pick a baseline</Button>
        </Link>
      </div>
    )
  }

  const stamp = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={`/app/scans/${scanId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Compare snapshots</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stamp(baseline.createdAt)} → {stamp(scan.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={baselineId}
            onChange={(e) => router.replace(`/app/scans/${scanId}/compare/${e.target.value}`)}
            className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
          >
            {siblings.map((s) => (
              <option key={s.id} value={s.id}>
                Baseline: {stamp(s.createdAt)}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            className="rounded-xl bg-transparent"
            onClick={() =>
              downloadCsv(
                [
                  ...diff.newFindings.map((f) => ({ change: "new", severity: f.severity, title: f.title, namespace: f.namespace, role: f.role })),
                  ...diff.resolvedFindings.map((f) => ({ change: "resolved", severity: f.severity, title: f.title, namespace: f.namespace, role: f.role })),
                ],
                "snapshot-diff.csv",
              )
            }
          >
            <Download className="w-4 h-4 mr-2" />
            Export diff
          </Button>
        </div>
      </div>

      {/* Metric table */}
      <div className="data-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Metric</th>
              <th className="text-right font-medium px-4 py-2.5">{stamp(baseline.createdAt)}</th>
              <th className="text-right font-medium px-4 py-2.5">{stamp(scan.createdAt)}</th>
              <th className="text-right font-medium px-4 py-2.5">Change</th>
            </tr>
          </thead>
          <tbody>
            {diff.metrics.map((metric) => {
              const flat = metric.delta === 0
              const good = metric.higherIsWorse ? metric.delta < 0 : metric.delta > 0
              const Icon = flat ? Minus : metric.delta > 0 ? TrendingUp : TrendingDown
              return (
                <tr key={metric.label} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium">{metric.label}</td>
                  <td className="px-4 py-2.5 text-right tabular text-muted-foreground">
                    {metric.baseline}
                    {metric.suffix}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular font-medium">
                    {metric.current}
                    {metric.suffix}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular",
                      flat ? "text-muted-foreground" : good ? "text-sev-pass" : "text-sev-high",
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Icon className="w-3.5 h-3.5" />
                      {flat ? "—" : `${metric.delta > 0 ? "+" : ""}${metric.delta}${metric.suffix ?? ""}`}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* New findings are the headline: a regression is the most actionable
          output of a recurring scanner. */}
      <ChangeSection
        title="New findings"
        subtitle="Present now, absent in the baseline — these are regressions."
        findings={diff.newFindings}
        scanId={scanId}
        tone="bad"
        emptyLabel="No new findings. Nothing regressed since the baseline."
      />

      <ChangeSection
        title="Resolved"
        subtitle="Present in the baseline, gone now."
        findings={diff.resolvedFindings}
        scanId={scanId}
        tone="good"
        emptyLabel="Nothing was resolved between these snapshots."
        collapsed
      />

      <div className="data-card p-5">
        <h2 className="text-lg font-semibold mb-1">Unchanged</h2>
        <p className="text-sm text-muted-foreground tabular">
          {diff.unchangedFindings.length} finding{diff.unchangedFindings.length === 1 ? "" : "s"} carried over
          unchanged.
        </p>
      </div>

      {diff.namespaceDeltas.length > 0 && (
        <div className="data-card p-5">
          <h2 className="text-lg font-semibold mb-3">Namespace deltas</h2>
          <div className="divide-y divide-border">
            {diff.namespaceDeltas.slice(0, 12).map((row) => (
              <div key={row.namespace} className="flex items-center gap-4 py-2 text-sm">
                <span className="flex-1 truncate font-medium">{row.namespace}</span>
                <span className="tabular text-muted-foreground">
                  {row.baseline ?? "—"} → {row.current ?? "—"}
                </span>
                <span
                  className={cn(
                    "tabular w-20 text-right",
                    row.delta === null
                      ? "text-muted-foreground"
                      : row.delta < 0
                        ? "text-sev-high"
                        : row.delta > 0
                          ? "text-sev-pass"
                          : "text-muted-foreground",
                  )}
                >
                  {row.delta === null
                    ? row.baseline === null
                      ? "new"
                      : "gone"
                    : row.delta === 0
                      ? "—"
                      : `${row.delta > 0 ? "+" : ""}${row.delta}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ChangeSection({
  title,
  subtitle,
  findings,
  scanId,
  tone,
  emptyLabel,
  collapsed = false,
}: {
  title: string
  subtitle: string
  findings: { id: string; title: string; severity: "critical" | "high" | "medium" | "low"; namespace: string }[]
  scanId: string
  tone: "good" | "bad"
  emptyLabel: string
  collapsed?: boolean
}) {
  const [open, setOpen] = useState(!collapsed)

  return (
    <div className={cn("data-card p-5 border-l-2", tone === "bad" ? "border-l-sev-critical" : "border-l-sev-pass")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {title} <span className="tabular text-muted-foreground font-normal">({findings.length})</span>
          </h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {findings.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setOpen((prev) => !prev)}>
            {open ? "Collapse" : "Expand"}
          </Button>
        )}
      </div>

      {findings.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        open && (
          <div className="mt-3 divide-y divide-border">
            {findings.map((finding) => (
              <div key={finding.id} className="flex items-start gap-3 py-2.5">
                <SeverityBadge severity={finding.severity} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/scans/${scanId}/findings/${finding.id}`}
                    className="text-sm font-medium hover:underline block truncate"
                  >
                    {finding.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {finding.namespace === "*" || !finding.namespace ? "cluster-wide" : finding.namespace}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
