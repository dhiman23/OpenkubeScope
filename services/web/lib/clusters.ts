// Cluster grouping.
//
// The app previously treated every upload as an independent island, which
// makes "is Production better than last week?" unanswerable — there is nothing
// to trend against. A Cluster is the long-lived asset; snapshots are its
// history. Cluster identity is derived from the scan's cluster name so
// uploading production-rbac.json twice produces one cluster with two
// snapshots, not two clusters.

import type { Scan } from "./rbac-scanner"
import { scoreForScan, scoreBand, type ScoreBand } from "./scoring"
import { isDatasetLoaded } from "./scan-dataset"

export type Environment = "prod" | "staging" | "dev" | "unlabelled"

export const ENV_LABEL: Record<Environment, string> = {
  prod: "PROD",
  staging: "STAGING",
  dev: "DEV",
  unlabelled: "UNLABELLED",
}

const ENV_OVERRIDE_KEY = "kubescope_cluster_env"

/** User-assigned environment labels. Server-side ownership is a backend task; until then this is a local preference. */
function readOverrides(): Record<string, Environment> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(localStorage.getItem(ENV_OVERRIDE_KEY) || "{}")
  } catch {
    return {}
  }
}

export function setClusterEnvironment(clusterId: string, env: Environment): void {
  if (typeof window === "undefined") return
  const overrides = readOverrides()
  overrides[clusterId] = env
  localStorage.setItem(ENV_OVERRIDE_KEY, JSON.stringify(overrides))
}

export function inferEnvironment(name: string): Environment {
  const n = (name || "").toLowerCase()
  if (/\b(prod|production|prd)\b/.test(n) || n.includes("prod")) return "prod"
  if (n.includes("stag") || n.includes("stg") || n.includes("uat") || n.includes("preprod")) return "staging"
  if (n.includes("dev") || n.includes("test") || n.includes("qa") || n.includes("sandbox")) return "dev"
  return "unlabelled"
}

/** Cluster name for a scan, falling back to the filename when the parser did not set one. */
export function clusterNameForScan(scan: Scan): string {
  const explicit = (scan.clusterName || "").trim()
  if (explicit && explicit.toLowerCase() !== "unknown") return explicit
  const base = (scan.fileName || "snapshot")
    .replace(/\.(json|zip)$/i, "")
    .replace(/[-_]?rbac[-_]?/i, " ")
    .replace(/[-_]\d{4}[-_]\d{2}[-_]\d{2}$/, "")
    .replace(/[-_]+/g, " ")
    .trim()
  return base || "Unnamed cluster"
}

export function clusterIdFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cluster"
}

export interface ClusterSnapshot {
  scan: Scan
  /** null when the snapshot's dataset was not loaded — never a stand-in number. */
  score: number | null
  band: ScoreBand | null
}

export interface ClusterGroup {
  id: string
  name: string
  environment: Environment
  snapshots: ClusterSnapshot[]
  latest: ClusterSnapshot
  previous: ClusterSnapshot | null
  scoreDelta: number | null
  criticalDelta: number | null
  highDelta: number | null
  /** Days since the most recent completed snapshot. */
  staleDays: number
}

const DAY_MS = 86_400_000

/**
 * Group snapshots into clusters.
 *
 * `hydrated` carries full scans (with datasets) keyed by id. List views load
 * metadata only, so callers fetch the full scan for the snapshots whose score
 * they actually display — typically each cluster's latest — and pass them here.
 * Snapshots without a hydrated entry report a null score rather than a
 * substitute derived a different way.
 */
export function groupScansIntoClusters(scans: Scan[], hydrated?: Map<string, Scan>): ClusterGroup[] {
  const overrides = readOverrides()
  const buckets = new Map<string, { name: string; scans: Scan[] }>()

  for (const scan of scans) {
    const name = clusterNameForScan(scan)
    const id = clusterIdFor(name)
    const bucket = buckets.get(id)
    if (bucket) bucket.scans.push(scan)
    else buckets.set(id, { name, scans: [scan] })
  }

  const groups: ClusterGroup[] = []
  for (const [id, bucket] of buckets) {
    const sorted = [...bucket.scans].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    const snapshots: ClusterSnapshot[] = sorted.map((scan) => {
      const full = isDatasetLoaded(scan) ? scan : (hydrated?.get(scan.id) ?? scan)
      const result = scoreForScan(full)
      return {
        scan,
        score: result.available ? result.score : null,
        band: result.available ? scoreBand(result.score) : null,
      }
    })

    const latest = snapshots[0]
    // Deltas compare against the previous *completed* snapshot only.
    const previous = snapshots.slice(1).find((s) => (s.scan.status ?? "completed") === "completed") ?? null

    groups.push({
      id,
      name: bucket.name,
      environment: overrides[id] ?? inferEnvironment(bucket.name),
      snapshots,
      latest,
      previous,
      scoreDelta:
        previous && latest.score !== null && previous.score !== null ? latest.score - previous.score : null,
      criticalDelta: previous
        ? (latest.scan.riskCounts?.critical ?? 0) - (previous.scan.riskCounts?.critical ?? 0)
        : null,
      highDelta: previous ? (latest.scan.riskCounts?.high ?? 0) - (previous.scan.riskCounts?.high ?? 0) : null,
      staleDays: Math.floor((Date.now() - new Date(latest.scan.createdAt).getTime()) / DAY_MS),
    })
  }

  // Worst first: the default view answers "which cluster is least secure?"
  // with zero interaction. Unscored clusters sort last — they are not "safe",
  // they are unknown.
  return groups.sort((a, b) => (a.latest.score ?? 101) - (b.latest.score ?? 101))
}

export interface FleetSummary {
  clusterCount: number
  snapshotCount: number
  /**
   * Worst cluster score, not the mean — averaging hides the one broken
   * cluster, which is the only one that matters. null when no cluster has a
   * computed score.
   */
  fleetScore: number | null
  totalCritical: number
  totalHigh: number
  staleClusters: number
  lastScanAt: string | null
}

export function summarizeFleet(groups: ClusterGroup[]): FleetSummary {
  if (groups.length === 0) {
    return {
      clusterCount: 0,
      snapshotCount: 0,
      fleetScore: null,
      totalCritical: 0,
      totalHigh: 0,
      staleClusters: 0,
      lastScanAt: null,
    }
  }

  let snapshotCount = 0
  let totalCritical = 0
  let totalHigh = 0
  let staleClusters = 0
  let lastScanAt: string | null = null

  for (const group of groups) {
    snapshotCount += group.snapshots.length
    totalCritical += group.latest.scan.riskCounts?.critical ?? 0
    totalHigh += group.latest.scan.riskCounts?.high ?? 0
    if (group.staleDays > 7) staleClusters += 1
    const at = group.latest.scan.createdAt
    if (!lastScanAt || new Date(at).getTime() > new Date(lastScanAt).getTime()) lastScanAt = at
  }

  const scored = groups.map((g) => g.latest.score).filter((s): s is number => s !== null)

  return {
    clusterCount: groups.length,
    snapshotCount,
    fleetScore: scored.length > 0 ? Math.min(...scored) : null,
    totalCritical,
    totalHigh,
    staleClusters,
    lastScanAt,
  }
}

/** The snapshot immediately preceding a given scan within its cluster. */
export function previousSnapshotOf(scans: Scan[], scanId: string): Scan | null {
  const current = scans.find((s) => s.id === scanId)
  if (!current) return null
  const clusterId = clusterIdFor(clusterNameForScan(current))
  const siblings = scans
    .filter((s) => clusterIdFor(clusterNameForScan(s)) === clusterId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const index = siblings.findIndex((s) => s.id === scanId)
  if (index === -1) return null
  for (let i = index + 1; i < siblings.length; i++) {
    if ((siblings[i].status ?? "completed") === "completed") return siblings[i]
  }
  return null
}
