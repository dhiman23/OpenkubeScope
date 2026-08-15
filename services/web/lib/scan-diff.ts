// Snapshot-to-snapshot comparison.
//
// A regression between snapshots — something that was fine yesterday and is
// not fine today — is the single most actionable output of a recurring
// scanner. New findings are therefore the headline of this view, not a section
// buried under a totals table.

import type { Scan, RBACFinding } from "./rbac-scanner"
import { scoreForScan, computeNamespaceScores, type NamespaceScore } from "./scoring"
import { evaluateCompliance } from "./compliance"
import { computeInventory } from "./inventory"

export interface MetricDelta {
  label: string
  baseline: number
  current: number
  delta: number
  /** True when an increase is bad (findings) rather than good (score). */
  higherIsWorse: boolean
  suffix?: string
}

export interface NamespaceDelta {
  namespace: string
  baseline: number | null
  current: number | null
  delta: number | null
}

export interface ScanDiff {
  baseline: Scan
  current: Scan
  metrics: MetricDelta[]
  newFindings: RBACFinding[]
  resolvedFindings: RBACFinding[]
  unchangedFindings: RBACFinding[]
  namespaceDeltas: NamespaceDelta[]
  scoreDelta: number
  criticalDelta: number
}

/**
 * Stable identity for a finding across snapshots.
 *
 * Finding ids are hashes of role+namespace+rule (see generateFindings), so they
 * are already stable for an unchanged role. Falling back to the composite key
 * keeps the diff correct for datasets produced by older scanner versions.
 */
function findingKey(finding: RBACFinding): string {
  return finding.id || `${finding.role}|${finding.namespace}|${finding.title}`
}

export function diffScans(baseline: Scan, current: Scan): ScanDiff {
  const baselineFindings = baseline.dataset?.findings ?? []
  const currentFindings = current.dataset?.findings ?? []

  const baselineKeys = new Map(baselineFindings.map((f) => [findingKey(f), f]))
  const currentKeys = new Map(currentFindings.map((f) => [findingKey(f), f]))

  const newFindings = currentFindings.filter((f) => !baselineKeys.has(findingKey(f)))
  const resolvedFindings = baselineFindings.filter((f) => !currentKeys.has(findingKey(f)))
  const unchangedFindings = currentFindings.filter((f) => baselineKeys.has(findingKey(f)))

  const baselineScore = scoreForScan(baseline)
  const currentScore = scoreForScan(current)
  const baselineCompliance = evaluateCompliance(baseline.dataset)
  const currentCompliance = evaluateCompliance(current.dataset)
  const baselineInv = computeInventory(baseline.dataset)
  const currentInv = computeInventory(current.dataset)

  const metrics: MetricDelta[] = [
    {
      label: "Security Score",
      baseline: baselineScore.score,
      current: currentScore.score,
      delta: currentScore.score - baselineScore.score,
      higherIsWorse: false,
    },
    {
      label: "Compliance",
      baseline: baselineCompliance.percentage,
      current: currentCompliance.percentage,
      delta: currentCompliance.percentage - baselineCompliance.percentage,
      higherIsWorse: false,
      suffix: "%",
    },
    {
      label: "Critical",
      baseline: baseline.riskCounts?.critical ?? 0,
      current: current.riskCounts?.critical ?? 0,
      delta: (current.riskCounts?.critical ?? 0) - (baseline.riskCounts?.critical ?? 0),
      higherIsWorse: true,
    },
    {
      label: "High",
      baseline: baseline.riskCounts?.high ?? 0,
      current: current.riskCounts?.high ?? 0,
      delta: (current.riskCounts?.high ?? 0) - (baseline.riskCounts?.high ?? 0),
      higherIsWorse: true,
    },
    {
      label: "Subjects",
      baseline: baseline.totals?.subjects ?? 0,
      current: current.totals?.subjects ?? 0,
      delta: (current.totals?.subjects ?? 0) - (baseline.totals?.subjects ?? 0),
      higherIsWorse: false,
    },
    {
      label: "Roles",
      baseline: baseline.totals?.roles ?? 0,
      current: current.totals?.roles ?? 0,
      delta: (current.totals?.roles ?? 0) - (baseline.totals?.roles ?? 0),
      higherIsWorse: false,
    },
    {
      label: "Bindings",
      baseline: baseline.totals?.bindings ?? 0,
      current: current.totals?.bindings ?? 0,
      delta: (current.totals?.bindings ?? 0) - (baseline.totals?.bindings ?? 0),
      higherIsWorse: false,
    },
    {
      label: "Namespaces",
      baseline: baselineInv.namespaceCount,
      current: currentInv.namespaceCount,
      delta: currentInv.namespaceCount - baselineInv.namespaceCount,
      higherIsWorse: false,
    },
  ]

  const baselineNs = new Map<string, NamespaceScore>(
    computeNamespaceScores(baselineFindings, baseline.totals?.roles ?? 1).map((n) => [n.namespace, n]),
  )
  const currentNs = new Map<string, NamespaceScore>(
    computeNamespaceScores(currentFindings, current.totals?.roles ?? 1).map((n) => [n.namespace, n]),
  )

  const namespaceDeltas: NamespaceDelta[] = Array.from(
    new Set([...baselineNs.keys(), ...currentNs.keys()]),
  )
    .map((namespace) => {
      const b = baselineNs.get(namespace)?.score ?? null
      const c = currentNs.get(namespace)?.score ?? null
      return {
        namespace,
        baseline: b,
        current: c,
        delta: b !== null && c !== null ? c - b : null,
      }
    })
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))

  return {
    baseline,
    current,
    metrics,
    newFindings,
    resolvedFindings,
    unchangedFindings,
    namespaceDeltas,
    scoreDelta: currentScore.score - baselineScore.score,
    criticalDelta: (current.riskCounts?.critical ?? 0) - (baseline.riskCounts?.critical ?? 0),
  }
}
