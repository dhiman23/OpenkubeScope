// Recommended actions.
//
// Ordered by score gain per unit of effort, NOT by severity. That ordering is
// the difference between a list of problems and a remediation plan: fixing one
// wildcard ClusterRole bound to 40 subjects beats chasing a single critical on
// a role nobody is bound to.

import type { RBACFinding } from "./rbac-scanner"
import { classifyFinding, computeScore, DOMAIN_BY_ID, type DomainId } from "./scoring"

export interface RecommendedAction {
  id: DomainId
  title: string
  detail: string
  /** Distinct roles/objects the action touches. */
  objectCount: number
  findingCount: number
  criticalCount: number
  /** Score points recovered if every finding in this domain is fixed. */
  scoreGain: number
  /** scoreGain per object touched — the ranking key. */
  efficiency: number
  href: string
}

const ACTION_COPY: Record<DomainId, { title: string; detail: string }> = {
  "cluster-admin": {
    title: "Reduce cluster-admin grants",
    detail: "Replace unrestricted bindings with least-privilege roles scoped to the namespaces each subject uses.",
  },
  "privilege-escalation": {
    title: "Close privilege escalation paths",
    detail: "Remove bind, escalate, impersonate and the ability to create roles or bindings from workload roles.",
  },
  "secret-access": {
    title: "Review secret readers",
    detail: "Scope secret access with resourceNames, or move credentials to an external secret manager.",
  },
  "workload-execution": {
    title: "Disable pod exec",
    detail: "Remove pods/exec and pods/attach from day-to-day roles; use an audited break-glass workflow instead.",
  },
  wildcard: {
    title: "Remove wildcard permissions",
    detail: "Replace * with the specific apiGroups, resources and verbs each workload actually requires.",
  },
  "identity-hygiene": {
    title: "Fix identity hygiene",
    detail: "Give each workload its own ServiceAccount and stop granting rights to default or anonymous identities.",
  },
  "node-access": {
    title: "Restrict node access",
    detail: "Limit nodes and nodes/proxy to monitoring components that genuinely need them.",
  },
  "binding-scope": {
    title: "Tighten binding scope",
    detail: "Convert cluster-wide grants to namespaced RoleBindings wherever the workload is namespace-local.",
  },
}

export function computeRecommendedActions(
  findings: RBACFinding[],
  evaluatedSurface: number,
  scanId: string,
): RecommendedAction[] {
  if (findings.length === 0) return []

  const base = computeScore(findings, { evaluatedSurface })
  const byDomain = new Map<DomainId, RBACFinding[]>()
  for (const finding of findings) {
    const domain = classifyFinding(finding)
    const list = byDomain.get(domain)
    if (list) list.push(finding)
    else byDomain.set(domain, [finding])
  }

  const actions: RecommendedAction[] = []
  for (const [domain, group] of byDomain) {
    // Score if every finding in this domain were fixed.
    //
    // Measured on the UNCAPPED score deliberately. The displayed score is
    // pinned at 74 while any critical is open, so comparing capped scores
    // returns 0 for every domain — which silently emptied this entire list on
    // exactly the snapshots that most needed a remediation plan.
    const without = computeScore(
      findings.filter((f) => classifyFinding(f) !== domain),
      { evaluatedSurface },
    )
    const scoreGain = without.uncappedScore - base.uncappedScore
    if (scoreGain <= 0) continue

    const objects = new Set(group.map((f) => `${f.namespace}/${f.role}`))
    const copy = ACTION_COPY[domain] ?? { title: DOMAIN_BY_ID[domain].label, detail: DOMAIN_BY_ID[domain].description }

    actions.push({
      id: domain,
      title: copy.title,
      detail: copy.detail,
      objectCount: objects.size,
      findingCount: group.length,
      criticalCount: group.filter((f) => f.severity === "critical").length,
      scoreGain,
      efficiency: scoreGain / Math.max(1, objects.size),
      href: `/app/scans/${scanId}/findings?domain=${domain}`,
    })
  }

  return actions.sort((a, b) => b.efficiency - a.efficiency || b.scoreGain - a.scoreGain).slice(0, 6)
}

export interface DangerousSubject {
  key: string
  name: string
  kind: string
  namespace: string
  score: number
  reasons: string[]
  criticalCount: number
  findingCount: number
}

/**
 * Subjects ranked by the findings that reach them.
 *
 * Findings are emitted per role; impactedSubjects carries the subjects bound to
 * that role, so this rolls role-level findings up to the identities that
 * actually hold the access.
 */
export function computeDangerousSubjects(findings: RBACFinding[], limit = 8): DangerousSubject[] {
  const bySubject = new Map<string, { reasons: Set<string>; critical: number; total: number; weight: number }>()

  const severityWeight = { critical: 4, high: 2, medium: 1, low: 0.5 }

  for (const finding of findings) {
    const subjects = finding.impactedSubjects?.length ? finding.impactedSubjects : []
    for (const subjectRef of subjects) {
      const entry = bySubject.get(subjectRef) ?? { reasons: new Set<string>(), critical: 0, total: 0, weight: 0 }
      // Strip the role name suffix from the title for a compact reason chip.
      entry.reasons.add((finding.title || "").split(":")[0].trim())
      if (finding.severity === "critical") entry.critical += 1
      entry.total += 1
      entry.weight += severityWeight[finding.severity] ?? 0.5
      bySubject.set(subjectRef, entry)
    }
  }

  const rows: DangerousSubject[] = []
  for (const [ref, entry] of bySubject) {
    // impactedSubjects entries look like "ServiceAccount:namespace/name" or "Kind/name".
    const match = /^([^:]+):([^/]*)\/(.+)$/.exec(ref) ?? /^([^/]+)\/(.+)$/.exec(ref)
    const kind = match ? match[1] : "Subject"
    const namespace = match && match.length === 4 ? match[2] || "cluster-wide" : "cluster-wide"
    const name = match ? match[match.length - 1] : ref

    rows.push({
      key: ref,
      name,
      kind,
      namespace: namespace === "-" ? "cluster-wide" : namespace,
      score: Math.round(entry.weight),
      reasons: Array.from(entry.reasons).slice(0, 3),
      criticalCount: entry.critical,
      findingCount: entry.total,
    })
  }

  return rows.sort((a, b) => b.score - a.score || b.criticalCount - a.criticalCount).slice(0, limit)
}
