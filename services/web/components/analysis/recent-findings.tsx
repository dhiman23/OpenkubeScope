"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SeverityBadge } from "@/components/posture/severity"
import { useScan } from "@/components/scan/scan-context"

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const

/** The few findings worth acting on now, not a truncated dump of everything. */
export function RecentFindings({ limit = 4 }: { limit?: number }) {
  const { scan, scanId } = useScan()

  const findings = useMemo(() => {
    const all = scan.dataset?.findings ?? []
    return [...all]
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          (b.impactedSubjects?.length ?? 0) - (a.impactedSubjects?.length ?? 0),
      )
      .slice(0, limit)
  }, [scan.dataset?.findings, limit])

  const criticalCount = scan.riskCounts?.critical ?? 0

  return (
    <div className="data-card p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-semibold">Top findings</h2>
        <Link href={`/app/scans/${scanId}/findings`} className="text-sm text-primary hover:underline">
          All findings
        </Link>
      </div>

      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No findings in this snapshot.</p>
      ) : (
        <div className="divide-y divide-border">
          {findings.map((finding) => (
            <div key={finding.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <SeverityBadge severity={finding.severity} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{finding.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {finding.namespace === "*" || !finding.namespace ? "cluster-wide" : finding.namespace} ·{" "}
                    {String(finding.category).replace(/_/g, " ").toLowerCase()}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{finding.remediation}</p>
                  <div className="mt-2 flex gap-3">
                    <Link
                      href={`/app/scans/${scanId}/findings/${finding.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Details
                    </Link>
                    <Link
                      href={`/app/scans/${scanId}/map?focus=${encodeURIComponent(`role:ClusterRole/${finding.role}`)}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Open in Map
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {criticalCount > limit && (
        <Link
          href={`/app/scans/${scanId}/findings?severity=critical`}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          All {criticalCount} critical findings
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  )
}
