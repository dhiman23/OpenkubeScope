// Report provenance — "which snapshot is this report actually about?".
//
// The bug this module exists to close: GenerateReport accepted scan_ids,
// persisted them on the row, and then ignored them, re-resolving "latest scan
// per cluster" at render time and summing the totals of every scan it found.
// A report opened from a snapshot showing 121 findings could therefore render
// 230, and nothing in the row said which snapshots those 230 came from.
//
// Two rules follow from that, and both are enforced here:
//   1. If the caller names scan ids, those are the only scans read.
//   2. Whatever is read is recorded — id, cluster, capture time, and whether
//      it was that cluster's newest snapshot — so a stale report can never be
//      mistaken for one describing the current scan.

import { namespaceStats, describeScope, isClusterScoped } from "./namespaces"
import type { ScanRow, ScanDataset } from "./rbac-types"

export type SelectionMode = "EXPLICIT" | "LATEST_PER_CLUSTER"

export interface SnapshotSource {
  scan_id: string
  cluster_name: string
  file_name: string
  /** When the snapshot itself was captured (scan.created_at). */
  snapshot_taken_at: string
  /** Was this the newest completed snapshot of its cluster at generation time? */
  is_latest: boolean
  totals: { subjects: number; roles: number; bindings: number }
  risk_counts: { critical: number; high: number; medium: number; low: number }
  namespace_count: number
  cluster_scoped_bindings: number
  /** Distinct subjects actually bound by this snapshot's bindings. */
  bound_subjects: number
}

export interface ReportProvenance {
  sources: SnapshotSource[]
  generated_at: string
  scope: string
  filters: string[]
  based_on_latest: boolean
  selection_mode: SelectionMode
}

/**
 * Distinct subjects reachable through this snapshot's bindings.
 *
 * `totals.subjects` is what the scanner recorded at parse time. When a snapshot
 * contains role-level findings but no bound subjects that number is legitimately
 * zero — which is why the count is reported as "bound subjects evaluated"
 * rather than as a bare "0 subjects". Deriving it here also repairs the case
 * where a snapshot format left `subjects` empty while the bindings clearly name
 * subjects: the report then counts what is actually in the data.
 */
export function countBoundSubjects(dataset: ScanDataset | null | undefined): number {
  const keys = new Set<string>()
  for (const binding of dataset?.bindings ?? []) {
    for (const subject of binding.subjects ?? []) {
      if (!subject?.name) continue
      const scope = isClusterScoped(subject.namespace) ? "" : subject.namespace!.trim()
      keys.add(`${subject.kind}/${scope}/${subject.name}`)
    }
  }
  return keys.size
}

/**
 * Subjects for a snapshot, preferring the recorded total but falling back to
 * the subjects named in the bindings when the recorded total is empty and the
 * bindings say otherwise. Returns the number plus how it was obtained, so the
 * report can label it honestly.
 */
export function resolveSubjectCount(scan: ScanRow): { count: number; derived: boolean } {
  const recorded = scan.totals?.subjects ?? 0
  if (recorded > 0) return { count: recorded, derived: false }

  const bound = countBoundSubjects(scan.scan_data)
  return bound > 0 ? { count: bound, derived: true } : { count: 0, derived: false }
}

/**
 * Normalise a timestamp to ISO 8601.
 *
 * created_at arrives from Postgres as a Date and crosses the gRPC boundary as a
 * proto string, which stringifies it in the server's locale
 * ("Thu Aug 13 2026 22:51:44 GMT+0300") — unparseable for a reader in another
 * timezone and inconsistent between services. Provenance always stores ISO.
 */
export function toIso(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export function buildSnapshotSource(scan: ScanRow, latestIdsByCluster: Map<string, string>): SnapshotSource {
  const stats = namespaceStats(scan.scan_data)
  const subjects = resolveSubjectCount(scan)

  return {
    scan_id: scan.id,
    cluster_name: scan.cluster_name,
    file_name: scan.file_name,
    snapshot_taken_at: toIso(scan.created_at),
    is_latest: latestIdsByCluster.get(scan.cluster_name) === scan.id,
    totals: {
      subjects: subjects.count,
      roles: scan.totals?.roles ?? 0,
      bindings: scan.totals?.bindings ?? 0,
    },
    risk_counts: {
      critical: scan.risk_counts?.critical ?? 0,
      high: scan.risk_counts?.high ?? 0,
      medium: scan.risk_counts?.medium ?? 0,
      low: scan.risk_counts?.low ?? 0,
    },
    namespace_count: stats.namespaceCount,
    cluster_scoped_bindings: stats.clusterScopedBindings,
    bound_subjects: countBoundSubjects(scan.scan_data),
  }
}

export function buildProvenance(params: {
  scans: ScanRow[]
  latestIdsByCluster: Map<string, string>
  selectionMode: SelectionMode
  filters?: string[]
  generatedAt?: string
}): ReportProvenance {
  const sources = params.scans.map((scan) => buildSnapshotSource(scan, params.latestIdsByCluster))

  // Scope is described from the union of the analysed snapshots, using the one
  // agreed phrasing ("7 namespaces + cluster-wide permissions").
  const namespaces = new Set<string>()
  let clusterScoped = 0
  for (const scan of params.scans) {
    const stats = namespaceStats(scan.scan_data)
    for (const ns of stats.namespaces) namespaces.add(ns)
    clusterScoped += stats.clusterScopedBindings + stats.clusterScopedRoles
  }

  return {
    sources,
    generated_at: params.generatedAt ?? new Date().toISOString(),
    scope: describeScope({
      namespaces: [...namespaces],
      namespaceCount: namespaces.size,
      clusterScopedBindings: clusterScoped,
      clusterScopedRoles: 0,
    }),
    filters: params.filters ?? [],
    based_on_latest: sources.length > 0 && sources.every((s) => s.is_latest),
    selection_mode: params.selectionMode,
  }
}

/** One-line provenance summary shared by the PDF cover and the report list. */
export function describeProvenance(provenance: ReportProvenance | null | undefined): string {
  if (!provenance || provenance.sources.length === 0) {
    return "Source snapshot not recorded"
  }
  if (provenance.sources.length === 1) {
    const source = provenance.sources[0]
    const when = formatTimestamp(source.snapshot_taken_at)
    const currency = source.is_latest ? "latest snapshot" : "earlier snapshot"
    return `${source.cluster_name} · snapshot ${when} · ${currency}`
  }
  const clusters = provenance.sources.map((s) => s.cluster_name).join(", ")
  return `${provenance.sources.length} snapshots (${clusters}) · ${
    provenance.based_on_latest ? "all latest" : "includes earlier snapshots"
  }`
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "unknown time"
  // Fixed, unambiguous, timezone-explicit — a report is read months later, in
  // another timezone, by someone who was not there when it was generated.
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`
}

/** Short scan-id form for display; the full id stays in the JSON payload. */
export function shortScanId(scanId: string): string {
  return scanId.length > 8 ? scanId.slice(0, 8) : scanId
}
