"use client"

import Link from "next/link"
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReportProvenance } from "@/lib/report-storage"

/**
 * "Which snapshot is this report about?"
 *
 * Report generation used to ignore the snapshot ids it was given and re-resolve
 * "latest scan per cluster" at render time, so a report opened from a snapshot
 * showing 121 findings could contain 230 — and nothing on the card said which
 * scan those numbers came from. Generation is fixed; this component is the
 * other half of the fix: every report states its source cluster, its exact
 * source snapshot and capture time, when it was generated, its scope and
 * filters, and whether that snapshot is still the newest.
 *
 * A report with no recorded provenance says so. It never borrows the currently
 * selected scan's identity.
 */

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "unknown"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "unknown"
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function shortScanId(scanId: string): string {
  return scanId.length > 8 ? scanId.slice(0, 8) : scanId
}

/** One-line summary for dense lists and report cards. */
export function ProvenanceLine({
  provenance,
  className,
}: {
  provenance: ReportProvenance | null | undefined
  className?: string
}) {
  if (!provenance || provenance.sources.length === 0) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Source snapshot not recorded — generated before provenance tracking
      </span>
    )
  }

  const source = provenance.sources[0]
  const extra = provenance.sources.length > 1 ? ` +${provenance.sources.length - 1} more` : ""

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-xs", className)}>
      <CurrencyBadge basedOnLatest={provenance.based_on_latest} />
      <span className="text-muted-foreground">
        {source.cluster_name} · snapshot {shortScanId(source.scan_id)} · captured{" "}
        {formatTimestamp(source.snapshot_taken_at)}
        {extra}
      </span>
    </span>
  )
}

/** Latest vs earlier, with words as well as colour. */
export function CurrencyBadge({ basedOnLatest }: { basedOnLatest: boolean }) {
  return basedOnLatest ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-sev-pass-bg px-2 py-0.5 text-[11px] font-medium text-sev-pass">
      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
      Latest snapshot
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-sev-medium-bg px-2 py-0.5 text-[11px] font-medium text-sev-medium">
      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
      Earlier snapshot
    </span>
  )
}

/** Full provenance block for a report detail view. */
export function ProvenancePanel({
  provenance,
  className,
}: {
  provenance: ReportProvenance | null | undefined
  className?: string
}) {
  if (!provenance || provenance.sources.length === 0) {
    return (
      <div className={cn("rounded-xl border border-dashed border-border p-4", className)}>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <HelpCircle className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          Source snapshot not recorded
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          This report was generated before KubeScope recorded report provenance, so the snapshot behind its numbers
          cannot be identified. Regenerate it to get a report that names its source.
        </p>
      </div>
    )
  }

  return (
    <div className={cn("rounded-xl border border-border p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Report source</h3>
        <CurrencyBadge basedOnLatest={provenance.based_on_latest} />
      </div>

      {!provenance.based_on_latest && (
        <p className="mt-2 text-xs text-sev-medium">
          A newer snapshot of this cluster exists. These numbers describe the snapshot below, not the current state.
        </p>
      )}

      <dl className="mt-3 space-y-2.5">
        {provenance.sources.map((source) => (
          <div key={source.scan_id} className="rounded-lg bg-muted/40 p-3">
            <dt className="text-sm font-medium">
              {source.cluster_name} — {source.file_name}
            </dt>
            <dd className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              <p>
                Snapshot <code className="rounded bg-background px-1 py-0.5">{source.scan_id}</code>
              </p>
              <p>Captured {formatTimestamp(source.snapshot_taken_at)}</p>
              <p>
                {source.totals.roles} roles · {source.totals.bindings} bindings ·{" "}
                {source.bound_subjects === 0
                  ? "0 bound subjects evaluated"
                  : `${source.bound_subjects} bound subjects`}
              </p>
              <p>
                {source.namespace_count} {source.namespace_count === 1 ? "namespace" : "namespaces"}
                {source.cluster_scoped_bindings > 0 &&
                  ` + ${source.cluster_scoped_bindings} cluster-wide binding${
                    source.cluster_scoped_bindings === 1 ? "" : "s"
                  }`}
              </p>
              <p>
                <Link
                  href={`/app/scans/${source.scan_id}`}
                  className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open this snapshot →
                </Link>
              </p>
            </dd>
          </div>
        ))}
      </dl>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Generated</dt>
          <dd>{formatTimestamp(provenance.generated_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Scope</dt>
          <dd>{provenance.scope || "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Filters</dt>
          <dd>{provenance.filters.length > 0 ? provenance.filters.join(" · ") : "None (all findings)"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Snapshot selection</dt>
          <dd>
            {provenance.selection_mode === "explicit"
              ? "Generated from an explicitly selected snapshot."
              : "Generated from the newest snapshot of each cluster at the time."}
          </dd>
        </div>
      </dl>
    </div>
  )
}
