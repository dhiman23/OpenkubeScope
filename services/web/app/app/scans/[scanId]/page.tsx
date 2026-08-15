"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { FixFirst } from "@/components/analysis/fix-first"
import { PostureStrip } from "@/components/analysis/posture-strip"
import { NamespaceHeatmap } from "@/components/analysis/namespace-heatmap"
import { InventoryPanel } from "@/components/analysis/inventory-panel"
import { AttackSurfaceGrid } from "@/components/analysis/attack-surface-grid"
import { TopDangerousSubjects } from "@/components/analysis/dangerous-subjects"
import { RecentFindings } from "@/components/analysis/recent-findings"
import { RecommendedActions } from "@/components/analysis/recommended-actions"
import { DistributionBars } from "@/components/charts/distribution-bars"
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart"
import { useScan } from "@/components/scan/scan-context"
import { clusterIdFor, clusterNameForScan } from "@/lib/clusters"
import { scoreForScan } from "@/lib/scoring"

/**
 * The Analysis Dashboard.
 *
 * Rows descend a cognitive ladder, each answering exactly one question:
 *   1. What do I fix first?            — Fix first
 *   2. Where is the danger?            — namespace heatmap + inventory
 *   3. How could I be attacked?        — attack surface + dangerous subjects
 *   4. Am I getting better or worse?   — score detail, trend + distribution
 *   5. What else is open?              — recent findings + recommended actions
 *
 * The score, critical and high counts live in the scan context bar directly
 * above this page, so the dashboard does not repeat them at the top. It opens
 * on remediation instead: a user who reads only row 1 knows what to do today,
 * and the posture detail they need to argue about the number is still one
 * scroll away.
 */
export default function AnalysisDashboardPage() {
  const { scan, allScans, clusterName, scanId } = useScan()
  const router = useRouter()

  const trendPoints = useMemo<TrendPoint[]>(() => {
    const clusterId = clusterIdFor(clusterName)
    return allScans
      .filter((s) => clusterIdFor(clusterNameForScan(s)) === clusterId)
      .filter((s) => (s.status ?? "completed") === "completed")
      .map((s) => ({ scan: s, result: scoreForScan(s) }))
      // Only snapshots whose score could actually be computed are plotted. A
      // missing point is honest; a zero would read as a catastrophic drop.
      .filter(({ result }) => result.available)
      .map(({ scan: s, result }) => ({
        scanId: s.id,
        timestamp: new Date(s.createdAt).getTime(),
        dateLabel: new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        score: result.score,
        critical: s.riskCounts?.critical ?? 0,
        high: s.riskCounts?.high ?? 0,
      }))
  }, [allScans, clusterName])

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const finding of scan.dataset?.findings ?? []) {
      const label = String(finding.category).replace(/_/g, " ").toLowerCase()
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [scan.dataset?.findings])

  return (
    <div className="space-y-6">
      {/* Row 1 — What do I fix first? */}
      <FixFirst />

      {/* Row 2 — Where is the danger, and what am I working with? */}
      <div className="grid gap-6 lg:grid-cols-2">
        <NamespaceHeatmap />
        <InventoryPanel />
      </div>

      {/* Row 3 — How could I be attacked, and by whom? */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AttackSurfaceGrid />
        <TopDangerousSubjects />
      </div>

      {/* Row 4 — Am I getting better or worse? */}
      <PostureStrip />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="data-card p-6 lg:col-span-3">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold">Risk trend</h2>
            <span className="text-xs text-muted-foreground">
              {trendPoints.length} snapshot{trendPoints.length === 1 ? "" : "s"} of {clusterName}
            </span>
          </div>
          <TrendChart points={trendPoints} />
          {trendPoints.length >= 2 && (
            <p className="mt-2 text-xs text-muted-foreground">Click a point to open that snapshot.</p>
          )}
        </div>

        <div className="data-card p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Findings distribution</h2>
          <DistributionBars
            counts={{
              critical: scan.riskCounts?.critical ?? 0,
              high: scan.riskCounts?.high ?? 0,
              medium: scan.riskCounts?.medium ?? 0,
              low: scan.riskCounts?.low ?? 0,
            }}
            onSelect={(severity) => router.push(`/app/scans/${scanId}/findings?severity=${severity}`)}
          />

          {categoryCounts.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">By category</p>
              <div className="space-y-1">
                {categoryCounts.map(([label, count]) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{label}</span>
                    <span className="tabular font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 5 — What else is open? */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RecentFindings />
        <RecommendedActions />
      </div>
    </div>
  )
}
