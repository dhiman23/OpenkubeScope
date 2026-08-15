import type { Scan } from "./rbac-scanner"

/**
 * Whether a scan actually carries its dataset.
 *
 * core-api's `?meta=1` response does NOT omit the dataset — it returns a stub
 * with empty arrays (`{subjects:[],roles:[],bindings:[],findings:[]}`). A bare
 * `scan.dataset` truthiness check therefore passes for metadata-only scans and
 * scores an empty findings list as a perfect 100, while the analysis page
 * computes the real number from the same snapshot. Two different scores for
 * one snapshot is precisely the failure this redesign exists to remove, so
 * every consumer must go through this predicate.
 */
export function isDatasetLoaded(scan: Scan | null | undefined): boolean {
  const dataset = scan?.dataset
  if (!dataset) return false

  const hasContent =
    (dataset.roles?.length ?? 0) > 0 ||
    (dataset.subjects?.length ?? 0) > 0 ||
    (dataset.bindings?.length ?? 0) > 0 ||
    (dataset.findings?.length ?? 0) > 0
  if (hasContent) return true

  // An empty dataset is only trustworthy when the snapshot really is empty.
  const totals = scan?.totals
  return (totals?.subjects ?? 0) === 0 && (totals?.roles ?? 0) === 0 && (totals?.bindings ?? 0) === 0
}
