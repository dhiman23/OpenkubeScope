"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Clock,
  GitCompare,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { getTimeAgo } from "@/lib/format-utils"
import { ENV_LABEL, type ClusterGroup } from "@/lib/clusters"
import { ScoreRing } from "@/components/posture/score-ring"
import { TrendDelta } from "@/components/posture/trend-delta"
import { Sparkline } from "@/components/charts/trend-chart"

const ENV_STYLE: Record<string, string> = {
  prod: "bg-sev-critical-bg text-sev-critical",
  staging: "bg-sev-medium-bg text-sev-medium",
  dev: "bg-sev-low-bg text-sev-low",
  unlabelled: "bg-muted text-muted-foreground",
}

/**
 * The cluster is the long-lived asset; snapshots are its history.
 *
 * A team scanning nightly would otherwise get 365 near-identical cards a year
 * for one cluster. The card leads with cluster identity — the filename is
 * metadata on the second line, never the headline.
 */
export function ClusterCard({ group, onDelete }: { group: ClusterGroup; onDelete?: (scanId: string) => void }) {
  const router = useRouter()
  const [historyOpen, setHistoryOpen] = useState(false)

  const latest = group.latest
  const scan = latest.scan
  const status = scan.status ?? "completed"
  const baselineLabel = group.previous
    ? new Date(group.previous.scan.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : undefined

  const openAnalysis = () => router.push(`/app/scans/${scan.id}`)

  // Only scored snapshots plot. A gap is honest; interpolating one is not.
  const trend = [...group.snapshots]
    .slice(0, 10)
    .reverse()
    .map((snapshot) => snapshot.score)
    .filter((score): score is number => score !== null)

  return (
    <div className="data-card overflow-hidden">
      {/* The whole header is the primary target; the button stays for
          discoverability and keyboard users. */}
      <div
        role="button"
        tabIndex={0}
        onClick={openAnalysis}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openAnalysis()
          }
        }}
        className="p-5 cursor-pointer hover:bg-muted/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg truncate">{group.name}</h3>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide",
                  ENV_STYLE[group.environment],
                )}
              >
                {ENV_LABEL[group.environment]}
              </span>
              {status === "pending" && (
                <span className="inline-flex items-center gap-1 text-xs text-sev-medium">
                  <Loader2 className="w-3 h-3 animate-spin" /> Analyzing
                </span>
              )}
              {status === "failed" && (
                <span className="inline-flex items-center gap-1 text-xs text-sev-critical">
                  <AlertCircle className="w-3 h-3" /> Failed
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground truncate">
              {scan.fileName} · uploaded {getTimeAgo(scan.createdAt)}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="rounded-xl shrink-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => router.push(`/app/scans/${scan.id}/compare`)}>
                <GitCompare className="w-4 h-4 mr-2" />
                Compare snapshots
              </DropdownMenuItem>
              {onDelete && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(scan.id)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete latest snapshot
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {status === "failed" ? (
          <div className="mt-4">
            <pre className="text-xs bg-muted rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
              {scan.errorMessage || "The scanner did not report a reason."}
            </pre>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-6 flex-wrap">
            <ScoreRing score={latest.score} size="lg" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 flex-1 min-w-[240px]">
              <Metric
                label="Critical"
                value={scan.riskCounts?.critical ?? 0}
                delta={group.criticalDelta}
                tone="critical"
                baselineLabel={baselineLabel}
              />
              <Metric
                label="High"
                value={scan.riskCounts?.high ?? 0}
                delta={group.highDelta}
                tone="high"
                baselineLabel={baselineLabel}
              />
              {/* A snapshot can legitimately contain role-level findings with
                  no bound subject. "0 subjects" reads as a broken scan, so the
                  count is labelled for what it actually measures. */}
              <Metric
                label={(scan.totals?.subjects ?? 0) === 0 ? "Bound subjects" : "Subjects"}
                value={scan.totals?.subjects ?? 0}
                hint={
                  (scan.totals?.subjects ?? 0) === 0
                    ? "0 bound subjects evaluated — this snapshot's findings are role-level, so no identity is bound to them yet."
                    : undefined
                }
              />
              <Metric label="Roles" value={scan.totals?.roles ?? 0} />
            </div>

            {trend.length >= 2 && (
              <div className="shrink-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Trend</p>
                <Sparkline points={trend} />
              </div>
            )}
          </div>
        )}

        {group.staleDays > 7 && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-sev-medium">
            <Clock className="w-3.5 h-3.5" />
            Last scanned {group.staleDays} days ago — this posture may be out of date.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
        <button
          type="button"
          onClick={() => setHistoryOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {group.snapshots.length} snapshot{group.snapshots.length === 1 ? "" : "s"}
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", historyOpen && "rotate-180")} />
        </button>

        <div className="flex items-center gap-2">
          {group.previous && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl bg-transparent"
              onClick={() => router.push(`/app/scans/${scan.id}/compare/${group.previous!.scan.id}`)}
            >
              <GitCompare className="w-3.5 h-3.5 mr-1.5" />
              Compare
            </Button>
          )}
          <Button size="sm" className="rounded-xl" onClick={openAnalysis}>
            Open Analysis
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>
      </div>

      {historyOpen && (
        <div className="border-t border-border bg-muted/20 divide-y divide-border">
          {group.snapshots.slice(0, 10).map((snapshot, index) => {
            const prev = group.snapshots[index + 1]
            return (
              <Link
                key={snapshot.scan.id}
                href={`/app/scans/${snapshot.scan.id}`}
                className="flex items-center gap-4 px-5 py-2.5 hover:bg-muted/40 transition-colors text-sm"
              >
                <span className="flex-1 truncate">
                  {new Date(snapshot.scan.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="tabular w-10 text-right font-medium">
                  {snapshot.score ?? <span className="text-muted-foreground">—</span>}
                </span>
                <TrendDelta
                  delta={
                    prev && snapshot.score !== null && prev.score !== null ? snapshot.score - prev.score : null
                  }
                  className="w-20 justify-end"
                />
                <span className="tabular w-16 text-right text-sev-critical">
                  C {snapshot.scan.riskCounts?.critical ?? 0}
                </span>
                <span className="tabular w-16 text-right text-sev-high">
                  H {snapshot.scan.riskCounts?.high ?? 0}
                </span>
              </Link>
            )
          })}
          {group.snapshots.length > 10 && (
            <p className="px-5 py-2.5 text-xs text-muted-foreground">
              ⋯ {group.snapshots.length - 10} older snapshots
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  delta,
  tone,
  baselineLabel,
  hint,
}: {
  label: string
  value: number
  delta?: number | null
  tone?: "critical" | "high"
  baselineLabel?: string
  hint?: string
}) {
  return (
    <div title={hint}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xl font-semibold tabular leading-tight",
          tone === "critical" && "text-sev-critical",
          tone === "high" && "text-sev-high",
        )}
      >
        {value}
      </p>
      <TrendDelta delta={delta} higherIsWorse={Boolean(tone)} baselineLabel={baselineLabel} />
    </div>
  )
}
