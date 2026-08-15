"use client"

import Link from "next/link"
import { ArrowRight, ChevronRight, ShieldAlert, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useScan } from "@/components/scan/scan-context"
import { computeDangerousSubjects, computeRecommendedActions } from "@/lib/recommended-actions"
import { isClusterScoped, scopeLabel } from "@/lib/namespaces"
import { useMemo } from "react"

/**
 * "Fix first" — the top of the dashboard.
 *
 * The dashboard previously opened with the same score, critical and high
 * numbers already pinned in the scan context bar directly above it, so the
 * first screen restated what the user could already see and said nothing about
 * what to do. This module answers the only question that matters on arrival:
 * of everything wrong in this snapshot, what should be fixed first, and where
 * does it land?
 *
 * Everything here is derived from the same findings the score uses — no
 * separate ranking model, so the priorities and the score can never disagree.
 */
export function FixFirst() {
  const { scan, scanId, score } = useScan()

  const findings = useMemo(() => scan.dataset?.findings ?? [], [scan.dataset?.findings])
  const criticalCount = scan.riskCounts?.critical ?? 0
  const highCount = scan.riskCounts?.high ?? 0

  const actions = useMemo(
    () => computeRecommendedActions(findings, scan.totals?.roles || findings.length || 1, scanId).slice(0, 3),
    [findings, scan.totals?.roles, scanId],
  )

  const subjects = useMemo(() => computeDangerousSubjects(findings, 3), [findings])

  /** Top finding types by count, worst severity first. */
  const topTypes = useMemo(() => {
    const byRule = new Map<
      string,
      { rule: string; count: number; critical: number; namespaces: Set<string>; clusterScoped: boolean }
    >()

    for (const finding of findings) {
      // Titles are "<rule>: <role>"; the rule is what groups them.
      const rule = (finding.title || "").split(":")[0].trim() || "Other"
      const entry = byRule.get(rule) ?? {
        rule,
        count: 0,
        critical: 0,
        namespaces: new Set<string>(),
        clusterScoped: false,
      }
      entry.count++
      if (finding.severity === "critical") entry.critical++
      if (isClusterScoped(finding.namespace)) entry.clusterScoped = true
      else entry.namespaces.add(finding.namespace)
      byRule.set(rule, entry)
    }

    return [...byRule.values()]
      .sort((a, b) => b.critical - a.critical || b.count - a.count)
      .slice(0, 4)
      .map((entry) => ({
        rule: entry.rule,
        count: entry.count,
        critical: entry.critical,
        scope: entry.clusterScoped
          ? [scopeLabel(null), ...[...entry.namespaces].slice(0, 2)]
          : [...entry.namespaces].slice(0, 3),
        extraScopes: Math.max(0, entry.namespaces.size - (entry.clusterScoped ? 2 : 3)),
      }))
  }, [findings])

  if (findings.length === 0) {
    return (
      <section aria-labelledby="fix-first-heading" className="data-card p-6">
        <h2 id="fix-first-heading" className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="w-5 h-5 text-sev-pass" aria-hidden="true" />
          Nothing to fix first
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This snapshot produced no findings. Keep scanning after RBAC changes to catch regressions early.
        </p>
      </section>
    )
  }

  const headlineCount = criticalCount > 0 ? criticalCount : highCount
  const headlineSeverity = criticalCount > 0 ? "critical" : "high"

  return (
    <section aria-labelledby="fix-first-heading" className="data-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="fix-first-heading" className="flex items-center gap-2 text-lg font-semibold">
            <ShieldAlert
              className={criticalCount > 0 ? "w-5 h-5 text-sev-critical" : "w-5 h-5 text-sev-high"}
              aria-hidden="true"
            />
            Fix first
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
            {headlineCount > 0 ? (
              <>
                {headlineCount} unresolved {headlineSeverity} finding{headlineCount === 1 ? "" : "s"} hold the posture
                score at {score.score}. Closing the priorities below removes the largest share of that risk.
              </>
            ) : (
              <>No critical or high findings remain. The items below are the next largest posture gains.</>
            )}
          </p>
        </div>

        <Link href={`/app/scans/${scanId}/findings?severity=critical&status=open`} className="shrink-0">
          <Button className="rounded-xl">
            Review critical findings
            <ArrowRight className="w-4 h-4 ml-1.5" aria-hidden="true" />
          </Button>
        </Link>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* 1 — what to do */}
        <div className="lg:col-span-2">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Priority actions</h3>
          <ol className="mt-2 space-y-2">
            {actions.length === 0 && (
              <li className="text-sm text-muted-foreground">
                No single domain dominates this snapshot — work the critical findings list directly.
              </li>
            )}
            {actions.map((action, index) => (
              <li key={action.id}>
                <Link
                  href={action.href}
                  className="group flex items-start gap-3 rounded-xl border border-border p-3 hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{action.title}</span>
                      {action.criticalCount > 0 && (
                        <span className="rounded-full bg-sev-critical-bg px-2 py-0.5 text-[11px] font-semibold text-sev-critical">
                          Critical {action.criticalCount}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{action.detail}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {action.findingCount} finding{action.findingCount === 1 ? "" : "s"} across {action.objectCount}{" "}
                      role{action.objectCount === 1 ? "" : "s"} · +{action.scoreGain} points if resolved
                    </span>
                  </span>
                  <ChevronRight
                    className="mt-1 w-4 h-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ol>
        </div>

        {/* 2 — what kind of problem, and 3 — who holds it */}
        <div className="space-y-5">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Top finding types</h3>
            <ul className="mt-2 space-y-1.5">
              {topTypes.map((type) => (
                <li key={type.rule}>
                  <Link
                    href={`/app/scans/${scanId}/findings?q=${encodeURIComponent(type.rule)}`}
                    className="group flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{type.rule}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {type.scope.join(", ")}
                        {type.extraScopes > 0 && ` +${type.extraScopes} more`}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular font-medium">{type.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Most dangerous subjects</h3>
            <ul className="mt-2 space-y-1.5">
              {subjects.length === 0 && (
                <li className="px-2 text-xs text-muted-foreground">
                  No bound subjects — these are role-level findings, so no identity holds them yet.
                </li>
              )}
              {subjects.map((subject) => (
                <li key={subject.key}>
                  <Link
                    href={`/app/scans/${scanId}/viewer?subject=${encodeURIComponent(subject.name)}`}
                    className="group flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{subject.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {subject.kind} · {scopeLabel(subject.namespace)}
                      </span>
                    </span>
                    {subject.criticalCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-sev-critical-bg px-2 py-0.5 text-[11px] font-semibold text-sev-critical">
                        Critical {subject.criticalCount}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground tabular">{subject.findingCount}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
