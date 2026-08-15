// Security scoring.
//
// A naive deduction (100 - 12*critical - 5*high ...) floors every serious
// cluster at 0 and cannot be decomposed, so "why 84?" has no answer. Instead
// the score is a weighted average of eight control-domain scores, each of
// which measures what fraction of the evaluated surface is compromised. That
// keeps it bounded, stable, and — most importantly — explainable.
//
// Deterministic: the same snapshot always produces the same score.

import type { RBACFinding, Scan } from "./rbac-scanner"
import { isDatasetLoaded } from "./scan-dataset"

export type DomainId =
  | "cluster-admin"
  | "privilege-escalation"
  | "secret-access"
  | "workload-execution"
  | "wildcard"
  | "identity-hygiene"
  | "node-access"
  | "binding-scope"

export interface DomainDef {
  id: DomainId
  label: string
  weight: number
  description: string
}

export const DOMAINS: DomainDef[] = [
  {
    id: "cluster-admin",
    label: "Cluster-admin sprawl",
    weight: 20,
    description: "Subjects holding cluster-admin or an equivalent unrestricted role.",
  },
  {
    id: "privilege-escalation",
    label: "Privilege escalation paths",
    weight: 20,
    description: "escalate, bind, impersonate, and the ability to create roles or bindings.",
  },
  {
    id: "secret-access",
    label: "Secret access",
    weight: 15,
    description: "Read or write access to secrets and service-account tokens.",
  },
  {
    id: "workload-execution",
    label: "Workload execution",
    weight: 12,
    description: "pods/exec, pods/attach and pods/portforward — shell and network access into pods.",
  },
  {
    id: "wildcard",
    label: "Wildcard permissions",
    weight: 12,
    description: "Rules using * for apiGroups, resources or verbs.",
  },
  {
    id: "identity-hygiene",
    label: "Identity hygiene",
    weight: 8,
    description: "Default service accounts, anonymous access, and unscoped identities.",
  },
  {
    id: "node-access",
    label: "Node & host access",
    weight: 8,
    description: "Access to nodes, nodes/proxy and kubelet surfaces.",
  },
  {
    id: "binding-scope",
    label: "Binding scope discipline",
    weight: 5,
    description: "Cluster-wide grants used where a namespaced grant would do.",
  },
]

export const DOMAIN_BY_ID: Record<DomainId, DomainDef> = DOMAINS.reduce(
  (acc, d) => ({ ...acc, [d.id]: d }),
  {} as Record<DomainId, DomainDef>,
)

const SEVERITY_WEIGHT: Record<RBACFinding["severity"], number> = {
  critical: 1.0,
  high: 0.6,
  medium: 0.3,
  low: 0.1,
}

/**
 * Map a finding onto a control domain.
 *
 * Findings carry no rule id (see generateFindings in rbac-scanner.ts), so we
 * classify on the title prefix the engine emits, and fall back to category.
 * Keep this in sync when detection rules are added.
 */
export function classifyFinding(finding: RBACFinding): DomainId {
  const title = (finding.title || "").toLowerCase()

  if (title.includes("cluster-admin")) return "cluster-admin"
  if (title.includes("secrets write") || title.includes("secrets read") || title.includes("token access"))
    return "secret-access"
  if (title.includes("pods/exec") || title.includes("pods/portforward") || title.includes("pods/attach"))
    return "workload-execution"
  if (
    title.includes("impersonate") ||
    title.includes("rolebinding creation") ||
    title.includes("clusterrole creation") ||
    title.includes("escalate")
  )
    return "privilege-escalation"
  if (title.includes("wildcard")) return "wildcard"
  if (title.includes("node access")) return "node-access"
  if (title.includes("workload mutation")) return "binding-scope"
  if (title.includes("default") || title.includes("anonymous") || title.includes("unauthenticated"))
    return "identity-hygiene"

  // Fallbacks for datasets whose categories differ (e.g. demo data).
  const category = (finding.category || "").toString().toUpperCase().replace(/\s+/g, "_")
  if (category === "PRIVILEGE_ESCALATION") return "privilege-escalation"
  if (category === "OVERLY_PERMISSIVE") return "wildcard"
  if (category === "MISCONFIGURATION") return "identity-hygiene"
  return "binding-scope"
}

function isClusterScoped(finding: RBACFinding): boolean {
  return !finding.namespace || finding.namespace === "*"
}

export interface DomainScore {
  id: DomainId
  label: string
  weight: number
  description: string
  score: number
  contribution: number
  findingCount: number
  criticalCount: number
  affectedWeight: number
}

export interface ScoreResult {
  /**
   * False when the snapshot's dataset was not loaded (list views use
   * loadScansMeta, which omits it). Callers must render "—", never a
   * substitute number: a fleet list showing 2 next to a dashboard showing 61
   * for the same snapshot is exactly how a security metric loses its
   * credibility.
   */
  available: boolean
  score: number
  band: ScoreBand
  domains: DomainScore[]
  evaluatedSurface: number
  suppressedCount: number
  suppressedGain: number
  /** Domain with the largest available improvement. */
  topOpportunity: DomainScore | null
  /** Score before the severity cap was applied, when one was. */
  uncappedScore: number
  /** Which severity forced the cap, or null when the cap did not bind. */
  cappedBy: "critical" | "high" | null
}

export type ScoreBand = "strong" | "moderate" | "weak" | "critical"

export const BAND_LABEL: Record<ScoreBand, string> = {
  strong: "Strong",
  moderate: "Moderate",
  weak: "Weak",
  critical: "Critical",
}

export function scoreBand(score: number): ScoreBand {
  if (score >= 90) return "strong"
  if (score >= 75) return "moderate"
  if (score >= 50) return "weak"
  return "critical"
}

export interface ScoreOptions {
  /**
   * Size of the surface being evaluated — normally the role count. Findings are
   * emitted per role, so roles are the correct denominator.
   */
  evaluatedSurface?: number
  /** Findings excluded by suppression, used to report the adjustment honestly. */
  suppressedFindings?: RBACFinding[]
  /**
   * Apply the severity cap. True for a snapshot's headline score; false for
   * comparative sub-scores such as per-namespace ranking, where capping every
   * namespace at 74 would flatten the ordering the ranking exists to show.
   */
  applyCap?: boolean
}

export function computeScore(findings: RBACFinding[], opts: ScoreOptions = {}): ScoreResult {
  const surface = Math.max(1, opts.evaluatedSurface ?? findings.length ?? 1)
  const suppressed = opts.suppressedFindings ?? []

  const buckets = new Map<DomainId, { weight: number; count: number; critical: number }>()
  for (const d of DOMAINS) buckets.set(d.id, { weight: 0, count: 0, critical: 0 })

  for (const finding of findings) {
    const domain = classifyFinding(finding)
    const bucket = buckets.get(domain)!
    const severity = SEVERITY_WEIGHT[finding.severity] ?? 0.1
    const scopeMultiplier = isClusterScoped(finding) ? 1.5 : 1.0
    bucket.weight += severity * scopeMultiplier
    bucket.count += 1
    if (finding.severity === "critical") bucket.critical += 1
  }

  const totalWeight = DOMAINS.reduce((sum, d) => sum + d.weight, 0)

  const domains: DomainScore[] = DOMAINS.map((def) => {
    const bucket = buckets.get(def.id)!
    const ratio = Math.min(1, bucket.weight / surface)
    const score = Math.round(100 * (1 - ratio))
    return {
      id: def.id,
      label: def.label,
      weight: def.weight,
      description: def.description,
      score,
      contribution: Number(((def.weight * score) / totalWeight).toFixed(1)),
      findingCount: bucket.count,
      criticalCount: bucket.critical,
      affectedWeight: Number(bucket.weight.toFixed(2)),
    }
  })

  const weighted = Math.round(domains.reduce((sum, d) => sum + d.weight * d.score, 0) / totalWeight)

  // Severity cap.
  //
  // The domain model measures the FRACTION of the surface that is
  // compromised, so a large cluster dilutes: 351 critical findings across
  // 1,600 roles computes to ~90, which the bands would call "Strong". A
  // security product cannot show "Strong" next to unresolved criticals — that
  // is as damaging to trust as an inconsistent number. The band is therefore
  // capped by the worst severity still open, and the cap is reported in the
  // breakdown rather than silently folded into the number.
  const openCritical = findings.filter((f) => f.severity === "critical").length
  const openHigh = findings.filter((f) => f.severity === "high").length
  const capEnabled = opts.applyCap ?? true
  const cap = !capEnabled ? 100 : openCritical > 0 ? 74 : openHigh > 0 ? 89 : 100
  const score = Math.min(weighted, cap)
  const cappedBy: ScoreResult["cappedBy"] = score < weighted ? (openCritical > 0 ? "critical" : "high") : null

  // What the suppressed findings would have cost, so the adjustment is visible.
  let suppressedGain = 0
  if (suppressed.length > 0) {
    const withSuppressed = computeScore([...findings, ...suppressed], {
      evaluatedSurface: surface,
      applyCap: capEnabled,
    })
    suppressedGain = score - withSuppressed.score
  }

  const topOpportunity =
    domains
      .filter((d) => d.score < 100)
      .sort((a, b) => (b.weight * (100 - b.score)) - (a.weight * (100 - a.score)))[0] ?? null

  return {
    available: true,
    score,
    band: scoreBand(score),
    domains,
    evaluatedSurface: surface,
    suppressedCount: suppressed.length,
    suppressedGain,
    topOpportunity,
    uncappedScore: weighted,
    cappedBy,
  }
}

export const UNAVAILABLE_SCORE: ScoreResult = {
  available: false,
  score: 0,
  band: "critical",
  domains: [],
  evaluatedSurface: 0,
  suppressedCount: 0,
  suppressedGain: 0,
  topOpportunity: null,
  uncappedScore: 0,
  cappedBy: null,
}

/**
 * Score a Scan.
 *
 * Requires the dataset: the domain model classifies individual findings, and
 * aggregate severity counts cannot be attributed to control domains. A scan
 * loaded via loadScansMeta therefore reports `available: false` rather than a
 * second, differently-derived number for the same snapshot.
 */
export function scoreForScan(scan: Scan | null | undefined, suppressed: RBACFinding[] = []): ScoreResult {
  if (!scan || !isDatasetLoaded(scan)) return UNAVAILABLE_SCORE
  const findings = scan.dataset?.findings ?? []
  const surface = scan.totals?.roles || findings.length || 1
  return computeScore(findings, { evaluatedSurface: surface, suppressedFindings: suppressed })
}

// ---------------------------------------------------------------------------
// Namespace posture
// ---------------------------------------------------------------------------

export interface NamespaceScore {
  namespace: string
  /** True for the synthetic bucket holding cluster-scoped grants. */
  isClusterWide: boolean
  score: number
  band: ScoreBand
  critical: number
  high: number
  medium: number
  low: number
  total: number
}

/**
 * Per-namespace scores, worst first.
 *
 * ClusterRoleBindings carry no namespace, so cluster-scoped findings land in a
 * synthetic "cluster-wide" bucket. Dropping them would hide the most dangerous
 * grants in the cluster.
 */
export function computeNamespaceScores(findings: RBACFinding[], evaluatedSurface: number): NamespaceScore[] {
  const groups = new Map<string, RBACFinding[]>()
  for (const finding of findings) {
    const ns = !finding.namespace || finding.namespace === "*" ? "__cluster__" : finding.namespace
    const list = groups.get(ns)
    if (list) list.push(finding)
    else groups.set(ns, [finding])
  }

  // Spread the evaluated surface across namespaces so a namespace with 3 roles
  // is not scored against the whole cluster's role count.
  const perNamespaceSurface = Math.max(1, Math.round(evaluatedSurface / Math.max(1, groups.size)))

  const out: NamespaceScore[] = []
  for (const [ns, group] of groups) {
    // Uncapped: these are comparative rankings, not headline ratings.
    const result = computeScore(group, { evaluatedSurface: perNamespaceSurface, applyCap: false })
    out.push({
      namespace: ns === "__cluster__" ? "cluster-wide" : ns,
      isClusterWide: ns === "__cluster__",
      score: result.score,
      band: result.band,
      critical: group.filter((f) => f.severity === "critical").length,
      high: group.filter((f) => f.severity === "high").length,
      medium: group.filter((f) => f.severity === "medium").length,
      low: group.filter((f) => f.severity === "low").length,
      total: group.length,
    })
  }

  return out.sort((a, b) => a.score - b.score || b.critical - a.critical)
}
