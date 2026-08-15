"use client"

import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AlertCircle, ArrowLeft, CheckCircle2, Circle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScanProvider } from "@/components/scan/scan-context"
import { ScanContextBar } from "@/components/scan/scan-context-bar"
import { FilterContextBar } from "@/components/scan/filter-context-bar"
import { getScan, hydrateScans, loadScansMeta } from "@/lib/scan-storage"
import { getActiveWorkspaceId } from "@/lib/workspace-manager"
import { clearAnalysisNavState, setAnalysisNavState } from "@/lib/analysis-nav-store"
import { clusterIdFor, clusterNameForScan } from "@/lib/clusters"
import type { Scan } from "@/lib/rbac-scanner"

type LoadState = "loading" | "missing" | "ready"

/**
 * The Analysis Workspace shell.
 *
 * The scan id comes from the route, so this layout is the single owner of the
 * scan: it fetches once and hands it to every child through ScanContext. The
 * old model — each page independently resolving an "active scan" from
 * localStorage and re-listening to a CustomEvent — meant duplicate fetches and
 * pages that could disagree about what was on screen.
 */
export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ scanId: string }>()
  const scanId = params?.scanId

  const [state, setState] = useState<LoadState>("loading")
  const [scan, setScan] = useState<Scan | null>(null)
  const [allScans, setAllScans] = useState<Scan[]>([])
  const [workspaceId, setWorkspaceId] = useState<string>("")

  const load = useCallback(async () => {
    if (!scanId) return
    const wsId = await getActiveWorkspaceId()
    if (!wsId) {
      setState("missing")
      return
    }
    setWorkspaceId(wsId)

    const [full, list] = await Promise.all([getScan(wsId, scanId), loadScansMeta(wsId)])
    if (!full) {
      setState("missing")
      return
    }
    setScan(full)
    setAllScans(list)
    setState("ready")

    // Scores are computed per finding, so the trend chart and the switcher
    // need real datasets — not aggregate counts. Hydrate this cluster's recent
    // siblings only, which keeps the request count bounded.
    const clusterId = clusterIdFor(clusterNameForScan(full))
    const siblingIds = list
      .filter((s) => s.id !== full.id && clusterIdFor(clusterNameForScan(s)) === clusterId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 11)
      .map((s) => s.id)

    if (siblingIds.length > 0) {
      const hydrated = await hydrateScans(wsId, siblingIds)
      setAllScans((prev) => prev.map((s) => hydrated.get(s.id) ?? s))
    }
  }, [scanId])

  useEffect(() => {
    setState("loading")
    load()
  }, [load])

  // Poll while the scanner worker is still processing (async SQS path).
  useEffect(() => {
    if (scan?.status !== "pending") return
    const timer = setInterval(load, 2000)
    return () => clearInterval(timer)
  }, [scan?.status, load])

  // Publish the badge count for the sidebar, which sits above this layout.
  useEffect(() => {
    if (!scan) return
    const open = (scan.riskCounts?.critical ?? 0) + (scan.riskCounts?.high ?? 0)
    setAnalysisNavState({ scanId: scan.id, openHighSeverity: open })
    return () => clearAnalysisNavState()
  }, [scan])

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Loading snapshot…</p>
        </div>
      </div>
    )
  }

  if (state === "missing" || !scan) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">Snapshot not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This snapshot doesn&apos;t exist in the active workspace, or it has been deleted.
          </p>
          <Link href="/app/clusters">
            <Button className="mt-5 rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to clusters
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (scan.status === "pending") {
    return <PendingScreen fileName={scan.fileName} />
  }

  if (scan.status === "failed") {
    return <FailedScreen fileName={scan.fileName} error={scan.errorMessage} onRetry={load} />
  }

  return (
    <ScanProvider scan={scan} workspaceId={workspaceId} allScans={allScans} refresh={load}>
      <div className="space-y-6">
        <ScanContextBar />
        <FilterContextBar />
        {children}
      </div>
    </ScanProvider>
  )
}

function Stage({ label, state }: { label: string; state: "done" | "active" | "todo" }) {
  const Icon = state === "done" ? CheckCircle2 : state === "active" ? Loader2 : Circle
  return (
    <span
      className={
        state === "done"
          ? "inline-flex items-center gap-1.5 text-sm text-sev-pass"
          : state === "active"
            ? "inline-flex items-center gap-1.5 text-sm text-primary"
            : "inline-flex items-center gap-1.5 text-sm text-muted-foreground"
      }
    >
      <Icon className={`w-4 h-4 ${state === "active" ? "animate-spin" : ""}`} />
      {label}
    </span>
  )
}

/** Never show an empty dashboard for a scan that is still being processed. */
function PendingScreen({ fileName }: { fileName: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-lg">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        <h2 className="mt-4 text-lg font-semibold">Analyzing {fileName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Queued for the scanner. This usually takes 10–30 seconds.
        </p>
        <div className="mt-6 flex items-center justify-center gap-5 flex-wrap">
          <Stage label="Uploaded" state="done" />
          <Stage label="Queued" state="done" />
          <Stage label="Scanning" state="active" />
          <Stage label="Ready" state="todo" />
        </div>
        <Link href="/app/clusters">
          <Button variant="outline" className="mt-6 rounded-xl bg-transparent">
            Back to clusters
          </Button>
        </Link>
      </div>
    </div>
  )
}

/** Surface the real parser error — "something went wrong" is unactionable. */
function FailedScreen({
  fileName,
  error,
  onRetry,
}: {
  fileName: string
  error?: string | null
  onRetry: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-lg">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-sev-critical-bg flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-sev-critical" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Analysis failed</h2>
        <p className="mt-1 text-sm text-muted-foreground">{fileName}</p>
        {error && (
          <pre className="mt-4 text-left text-xs bg-muted rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
            {error}
          </pre>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={onRetry} className="rounded-xl">
            Retry
          </Button>
          <Link href="/app/clusters">
            <Button variant="outline" className="rounded-xl bg-transparent">
              Back to clusters
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
