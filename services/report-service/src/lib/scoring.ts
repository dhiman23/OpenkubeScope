// Security scoring — port of services/web/lib/scoring.ts.
//
// The PDF must print the same number the app shows for the same snapshot. The
// score cannot be derived from aggregate severity counts (it classifies
// individual findings into control domains), so it is recomputed here from the
// same findings using the same formula rather than approximated.
//
// This file is a deliberate duplicate of the web module, matching the existing
// convention in this service (see rbac-recommendations.ts). If the domain
// weights or the severity cap change in one place they must change in both;
// scoring.test.ts pins the shared cases.

import type { RBACFinding, ScanDataset } from "./rbac-types"

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
}

export const DOMAINS: DomainDef[] = [
  { id: "cluster-admin", label: "Cluster-admin sprawl", weight: 20 },
  { id: "privilege-escalation", label: "Privilege escalation paths", weight: 20 },
  { id: "secret-access", label: "Secret access", weight: 15 },
  { id: "workload-execution", label: "Workload execution", weight: 12 },
  { id: "wildcard", label: "Wildcard permissions", weight: 12 },
  { id: "identity-hygiene", label: "Identity hygiene", weight: 8 },
  { id: "node-access", label: "Node & host access", weight: 8 },
  { id: "binding-scope", label: "Binding scope discipline", weight: 5 },
]

const SEVERITY_WEIGHT: Record<string, number> = { critical: 1.0, high: 0.6, medium: 0.3, low: 0.1 }

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

  const category = (finding.category || "").toString().toUpperCase().replace(/\s+/g, "_")
  if (category === "PRIVILEGE_ESCALATION") return "privilege-escalation"
  if (category === "OVERLY_PERMISSIVE") return "wildcard"
  if (category === "MISCONFIGURATION") return "identity-hygiene"
  return "binding-scope"
}

function isClusterScopedFinding(finding: RBACFinding): boolean {
  return !finding.namespace || finding.namespace === "*"
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

export interface DomainScore {
  id: DomainId
  label: string
  weight: number
  score: number
  contribution: number
  findingCount: number
  criticalCount: number
}

export interface ScoreResult {
  available: boolean
  score: number
  /** Uncapped domain-weighted score, reported alongside the capped one. */
  uncappedScore: number
  band: ScoreBand
  cappedBy: "critical" | "high" | null
  domains: DomainScore[]
  evaluatedSurface: number
  topOpportunity: DomainScore | null
}

export const UNAVAILABLE_SCORE: ScoreResult = {
  available: false,
  score: 0,
  uncappedScore: 0,
  band: "critical",
  cappedBy: null,
  domains: [],
  evaluatedSurface: 0,
  topOpportunity: null,
}

export function computeScore(
  findings: RBACFinding[],
  opts: { evaluatedSurface?: number; applyCap?: boolean } = {},
): ScoreResult {
  const surface = Math.max(1, opts.evaluatedSurface ?? findings.length ?? 1)

  const buckets = new Map<DomainId, { weight: number; count: number; critical: number }>()
  for (const d of DOMAINS) buckets.set(d.id, { weight: 0, count: 0, critical: 0 })

  for (const finding of findings) {
    const bucket = buckets.get(classifyFinding(finding))!
    const severity = SEVERITY_WEIGHT[finding.severity] ?? 0.1
    const scopeMultiplier = isClusterScopedFinding(finding) ? 1.5 : 1.0
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
      score,
      contribution: Number(((def.weight * score) / totalWeight).toFixed(1)),
      findingCount: bucket.count,
      criticalCount: bucket.critical,
    }
  })

  const weighted = Math.round(domains.reduce((sum, d) => sum + d.weight * d.score, 0) / totalWeight)

  // Severity cap — see Appendix A.5 of the design spec. A large cluster
  // dilutes the fraction-based model, so an unresolved critical must never
  // read as "Strong".
  const openCritical = findings.filter((f) => f.severity === "critical").length
  const openHigh = findings.filter((f) => f.severity === "high").length
  const capEnabled = opts.applyCap ?? true
  const cap = !capEnabled ? 100 : openCritical > 0 ? 74 : openHigh > 0 ? 89 : 100
  const score = Math.min(weighted, cap)
  const cappedBy: ScoreResult["cappedBy"] = score < weighted ? (openCritical > 0 ? "critical" : "high") : null

  const topOpportunity =
    domains.filter((d) => d.score < 100).sort((a, b) => b.weight * (100 - b.score) - a.weight * (100 - a.score))[0] ??
    null

  return {
    available: true,
    score,
    uncappedScore: weighted,
    band: scoreBand(score),
    cappedBy,
    domains,
    evaluatedSurface: surface,
    topOpportunity,
  }
}

/**
 * Score one snapshot. `roleCount` is the evaluated surface (findings are
 * emitted per role), matching scoreForScan() in the web app.
 */
export function scoreForDataset(dataset: ScanDataset | null | undefined, roleCount: number): ScoreResult {
  const findings = dataset?.findings ?? []
  if (!dataset || (findings.length === 0 && roleCount === 0)) return UNAVAILABLE_SCORE
  return computeScore(findings, { evaluatedSurface: roleCount || findings.length || 1 })
}

/** One-line explanation of the cap, for the PDF and the report detail view. */
export function describeCap(result: ScoreResult): string | null {
  if (!result.cappedBy) return null
  const worst = result.cappedBy === "critical" ? "critical" : "high-severity"
  const ceiling = result.cappedBy === "critical" ? 74 : 89
  return `Calculated score: ${result.uncappedScore}. Displayed score: ${result.score} because unresolved ${worst} findings cap the posture score at ${ceiling}.`
}
