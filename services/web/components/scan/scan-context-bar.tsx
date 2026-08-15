"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  GitCompare,
  Loader2,
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
import { ENV_LABEL } from "@/lib/clusters"
import { ScoreRing } from "@/components/posture/score-ring"
import { TrendDelta } from "@/components/posture/trend-delta"
import { NotCollected, type NotCollectedField } from "@/components/ui/not-collected"
import { describeScope, namespaceStats } from "@/lib/namespaces"
import { useScan } from "./scan-context"
import { ScanSwitcher } from "./scan-switcher"
import { downloadFindingsCsv, downloadScanJson } from "@/lib/export"

const ENV_STYLE: Record<string, string> = {
  prod: "bg-sev-critical-bg text-sev-critical",
  staging: "bg-sev-medium-bg text-sev-medium",
  dev: "bg-sev-low-bg text-sev-low",
  unlabelled: "bg-muted text-muted-foreground",
}

function StatusPill({ status }: { status?: string }) {
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sev-critical">
        <AlertCircle className="w-3.5 h-3.5" /> Failed
      </span>
    )
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sev-medium">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sev-pass">
      <CheckCircle2 className="w-3.5 h-3.5" /> Completed
    </span>
  )
}

/**
 * A metric with its label.
 *
 * Absent values never render as a bare dash: an unexplained "—" reads as a
 * zero, a spinner, or a bug. `notCollected` swaps in the shared pattern, which
 * says what is missing, why it matters, and how to collect it.
 */
function Metric({
  label,
  value,
  delta,
  higherIsWorse,
  suffix,
  hint,
  notCollected,
}: {
  label: string
  value?: string | number | null
  delta?: number | null
  higherIsWorse?: boolean
  suffix?: string
  hint?: string
  notCollected?: NotCollectedField
}) {
  return (
    <div className="min-w-0" title={hint}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {notCollected ? (
        <p className="leading-tight py-0.5">
          <NotCollected field={notCollected} />
        </p>
      ) : (
        <p className="text-lg font-semibold tabular leading-tight">
          {value === null || value === undefined ? <span className="text-muted-foreground">—</span> : value}
          {value !== null && suffix}
        </p>
      )}
      <TrendDelta delta={delta} higherIsWorse={higherIsWorse} />
    </div>
  )
}

/**
 * The persistent answer to "which scan am I analyzing?".
 *
 * The scan id is already in the URL — this bar makes it legible. It collapses
 * to a 48px strip on scroll so it never competes with the page content.
 */
export function ScanContextBar() {
  const { scan, clusterName, environment, score, previousScore, previous, compliance } = useScan()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const onScroll = () => setCollapsed(window.scrollY > 120)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const baselineLabel = previous
    ? new Date(previous.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : undefined
  const scoreDelta = previousScore ? score.score - previousScore.score : null
  const criticalDelta = previous
    ? (scan.riskCounts?.critical ?? 0) - (previous.riskCounts?.critical ?? 0)
    : null
  const highDelta = previous ? (scan.riskCounts?.high ?? 0) - (previous.riskCounts?.high ?? 0) : null

  const namespaces = namespaceStats(scan.dataset)
  const scope = describeScope(namespaces)

  const actions = (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl bg-transparent"
        onClick={() => router.push(`/app/scans/${scan.id}/compare`)}
      >
        <GitCompare className="w-4 h-4 mr-1.5" />
        Compare
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-xl bg-transparent">
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => downloadFindingsCsv(scan)}>Findings as CSV</DropdownMenuItem>
          <DropdownMenuItem onClick={() => downloadScanJson(scan)}>Snapshot as JSON</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        className="rounded-xl bg-transparent"
        onClick={() => router.push(`/app/scans/${scan.id}/reports`)}
      >
        <FileText className="w-4 h-4 mr-1.5" />
        Report
      </Button>

      <ScanSwitcher />
    </div>
  )

  if (collapsed) {
    return (
      <div className="sticky top-14 z-30 -mx-6 px-6 h-12 flex items-center justify-between gap-4 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium truncate">{clusterName}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {new Date(scan.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          <span className="tabular text-sm shrink-0">
            Score <span className="font-semibold">{score.score}</span>
          </span>
          <span className="tabular text-sm text-sev-critical shrink-0">
            Critical {scan.riskCounts?.critical ?? 0}
          </span>
          <span className="tabular text-sm text-sev-high shrink-0">High {scan.riskCounts?.high ?? 0}</span>
        </div>
        <ScanSwitcher compact />
      </div>
    )
  }

  return (
    <div className="-mx-6 px-6 pb-5 border-b border-border">
      <Link
        href="/app/clusters"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        All clusters
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{clusterName}</h1>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide",
                ENV_STYLE[environment],
              )}
            >
              {ENV_LABEL[environment]}
            </span>
            <StatusPill status={scan.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground truncate">
            {scan.fileName} · uploaded {getTimeAgo(scan.createdAt)}
          </p>
        </div>

        {actions}
      </div>

      <div className="mt-5 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <ScoreRing score={score.score} size="md" showBand={false} />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Security score</p>
            <p className="text-lg font-semibold tabular leading-tight">
              {score.score}
              <span className="text-sm text-muted-foreground font-normal"> /100</span>
            </p>
            <TrendDelta delta={scoreDelta} baselineLabel={baselineLabel} />
          </div>
        </div>

        <Metric
          label="Critical"
          value={scan.riskCounts?.critical ?? 0}
          delta={criticalDelta}
          higherIsWorse
        />
        <Metric label="High" value={scan.riskCounts?.high ?? 0} delta={highDelta} higherIsWorse />
        <Metric label="Compliance" value={compliance.percentage} suffix="%" hint={compliance.framework} />
        {/* cluster-wide is a scope, not a namespace — the count says so. */}
        <Metric
          label="Scope"
          value={scope}
          hint={
            namespaces.hasClusterScopedAccess
              ? `${namespaces.namespaceCount} namespaces, plus ClusterRole/ClusterRoleBinding grants that apply cluster-wide`
              : `${namespaces.namespaceCount} namespaces; no cluster-scoped grants`
          }
        />
        <Metric label="Kubernetes" notCollected="kubernetesVersion" />
        <Metric label="Duration" notCollected="duration" />
      </div>
    </div>
  )
}
