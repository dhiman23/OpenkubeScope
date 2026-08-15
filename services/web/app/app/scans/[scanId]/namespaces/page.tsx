"use client"

import Link from "next/link"
import { Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { BAND_LABEL } from "@/lib/scoring"
import { BAND_TEXT } from "@/components/posture/severity"
import { ScoreRing } from "@/components/posture/score-ring"
import { useScan } from "@/components/scan/scan-context"

const BAND_BAR: Record<string, string> = {
  strong: "bg-band-strong",
  moderate: "bg-band-moderate",
  weak: "bg-band-weak",
  critical: "bg-band-critical",
}

export default function NamespacesPage() {
  const { namespaceScores, scanId, inventory } = useScan()

  const withoutFindings = inventory.namespaces.filter(
    (ns) => !namespaceScores.some((row) => row.namespace === ns),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Namespace posture</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ranked worst-first. Cluster-scoped grants have no namespace of their own, so they are collected under
          &ldquo;cluster-wide&rdquo; — dropping them would hide the most dangerous grants in the cluster.
        </p>
      </div>

      {namespaceScores.length === 0 ? (
        <div className="data-card p-10 text-center">
          <p className="font-medium">No namespaced findings</p>
          <p className="mt-1 text-sm text-muted-foreground">This snapshot produced no findings to rank.</p>
        </div>
      ) : (
        <div className="data-card divide-y divide-border">
          {namespaceScores.map((row) => (
            <Link
              key={row.namespace}
              href={`/app/scans/${scanId}/findings?ns=${encodeURIComponent(row.namespace)}`}
              className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
            >
              <span className={cn("w-1.5 h-12 rounded-full shrink-0", BAND_BAR[row.band])} aria-hidden />
              <ScoreRing score={row.score} size="md" showBand={false} />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  {row.isClusterWide && <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className="font-medium truncate">{row.namespace}</span>
                </span>
                <span className={cn("text-sm", BAND_TEXT[row.band])}>{BAND_LABEL[row.band]}</span>
              </span>
              <span className="flex items-center gap-5 tabular text-sm shrink-0">
                <span className="text-sev-critical">{row.critical} critical</span>
                <span className="text-sev-high">{row.high} high</span>
                <span className="text-muted-foreground">{row.total} total</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {withoutFindings.length > 0 && (
        <div className="data-card p-5">
          <h2 className="font-medium">Namespaces with no findings ({withoutFindings.length})</h2>
          <p className="mt-1 text-sm text-muted-foreground mb-3">
            These namespaces have RBAC objects but produced no findings.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {withoutFindings.map((ns) => (
              <span key={ns} className="text-xs rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                {ns}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
