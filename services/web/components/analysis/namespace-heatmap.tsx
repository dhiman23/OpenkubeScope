"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Globe, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { BAND_LABEL, type NamespaceScore } from "@/lib/scoring"
import { BAND_TEXT } from "@/components/posture/severity"
import { CLUSTER_SCOPE, namespaceStats } from "@/lib/namespaces"
import { useScan } from "@/components/scan/scan-context"

const BAND_BAR: Record<string, string> = {
  strong: "bg-band-strong",
  moderate: "bg-band-moderate",
  weak: "bg-band-weak",
  critical: "bg-band-critical",
}

/**
 * Namespaces ranked by risk, worst first — with cluster-scoped access split out.
 *
 * ClusterRoleBindings carry no namespace. This panel used to fold them into the
 * same list as a row called "cluster-wide" and then count the rows, so a
 * snapshot with 6 namespaces holding findings reported "7 namespaces" here
 * while the scan bar reported the 7 real namespaces in the snapshot — two
 * different numbers for the same thing. Cluster-scoped grants are still shown
 * (they are the most dangerous access in the cluster and hiding them would be
 * worse), but under their own heading, and never inside a namespace count.
 */
export function NamespaceHeatmap({ limit = 6 }: { limit?: number }) {
  const { namespaceScores, scanId, scan } = useScan()
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)

  const clusterScoped = namespaceScores.find((row) => row.isClusterWide) ?? null
  const namespaced = namespaceScores.filter((row) => !row.isClusterWide)
  const stats = namespaceStats(scan.dataset)

  const open = (namespace: string) =>
    router.push(`/app/scans/${scanId}/findings?ns=${encodeURIComponent(namespace)}`)

  if (namespaceScores.length === 0) {
    return (
      <div className="data-card p-6">
        <h2 className="text-lg font-semibold">Namespace risk</h2>
        <p className="mt-3 text-sm text-muted-foreground">No findings in this snapshot.</p>
      </div>
    )
  }

  const rows = expanded ? namespaced : namespaced.slice(0, limit)

  return (
    <div className="data-card p-6">
      <div className="flex items-center justify-between gap-4 mb-1">
        <h2 className="text-lg font-semibold">Namespace risk</h2>
        <span className="text-xs text-muted-foreground tabular">
          {namespaced.length} of {stats.namespaceCount} {stats.namespaceCount === 1 ? "namespace" : "namespaces"} with
          findings
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Select a namespace to scope the findings list to it.</p>

      {namespaced.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No namespaced findings — every finding in this snapshot is cluster-scoped.
        </p>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => (
            <NamespaceRow key={row.namespace} row={row} onSelect={() => open(row.namespace)} />
          ))}
        </div>
      )}

      {namespaced.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-3 rounded text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? "Show fewer namespaces" : `Show all ${namespaced.length} namespaces with findings`}
        </button>
      )}

      {/* Cluster-scoped access: its own section, never a namespace. */}
      {clusterScoped && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Globe className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              Cluster-scoped access
            </h3>
            <span className="text-xs text-muted-foreground tabular">
              {stats.clusterScopedBindings} cluster-wide binding{stats.clusterScopedBindings === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            ClusterRoles and ClusterRoleBindings apply across every namespace, so they are counted separately rather
            than as a namespace.
          </p>
          <NamespaceRow row={clusterScoped} label="Cluster-wide" onSelect={() => open(CLUSTER_SCOPE)} />
        </div>
      )}
    </div>
  )
}

function NamespaceRow({
  row,
  label,
  onSelect,
}: {
  row: NamespaceScore
  label?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={cn("w-1.5 h-8 rounded-full shrink-0", BAND_BAR[row.band])} aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block truncate font-medium">{label ?? row.namespace}</span>
        <span className="text-xs text-muted-foreground">{BAND_LABEL[row.band]}</span>
      </span>

      {/* Counts are labelled in full: "C 38" reads as a code, not a count. */}
      <span className="flex items-center gap-4 shrink-0 tabular text-sm">
        <span className={cn("font-semibold w-8 text-right", BAND_TEXT[row.band])}>{row.score}</span>
        <span className="text-sev-critical w-20 text-right">Critical {row.critical}</span>
        <span className="text-sev-high w-16 text-right">High {row.high}</span>
      </span>

      <ChevronRight
        className="w-4 h-4 shrink-0 text-muted-foreground/70 group-hover:text-foreground transition-colors"
        aria-hidden="true"
      />
    </button>
  )
}
