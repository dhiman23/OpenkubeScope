"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { computeRecommendedActions } from "@/lib/recommended-actions"
import { useScan } from "@/components/scan/scan-context"

/**
 * Ordered by score gain per unit of effort, not by severity.
 *
 * That ordering is what turns a list of problems into a remediation plan:
 * fixing one wildcard ClusterRole bound to 40 subjects beats chasing a single
 * critical on a role nobody is bound to.
 */
export function RecommendedActions() {
  const { scan, scanId } = useScan()

  const actions = useMemo(
    () =>
      computeRecommendedActions(
        scan.dataset?.findings ?? [],
        scan.totals?.roles || 1,
        scanId,
      ),
    [scan.dataset?.findings, scan.totals?.roles, scanId],
  )

  return (
    <div className="data-card p-6">
      <h2 className="text-lg font-semibold mb-1">Recommended actions</h2>
      <p className="text-sm text-muted-foreground mb-4">Ranked by score gained per object you have to touch.</p>

      {actions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to recommend — no finding group in this snapshot would measurably move the score.
        </p>
      ) : (
        <ol className="space-y-3">
          {actions.map((action, index) => (
            <li key={action.id}>
              <Link
                href={action.href}
                className="flex items-start gap-3 rounded-xl p-3 -mx-1 hover:bg-muted/50 transition-colors group"
              >
                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium tabular shrink-0 mt-0.5">
                  {index + 1}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium block">{action.title}</span>
                  <span className="text-sm text-muted-foreground block mt-0.5">{action.detail}</span>
                  <span className="mt-1.5 block text-xs text-muted-foreground tabular">
                    {action.objectCount} object{action.objectCount === 1 ? "" : "s"} · fixes {action.findingCount}{" "}
                    finding{action.findingCount === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-sm font-semibold tabular text-sev-pass">+{action.scoreGain}</span>
                  <span className="block text-[11px] text-muted-foreground">score</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
