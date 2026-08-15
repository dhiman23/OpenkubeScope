"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, BookOpen, Check, Copy, Loader2, Server, Sparkles, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getTimeAgo } from "@/lib/format-utils"
import type { Scan } from "@/lib/rbac-scanner"
import { hydrateScans, loadScansMeta } from "@/lib/scan-storage"
import { getActiveWorkspace } from "@/lib/workspace-manager"
import { groupScansIntoClusters, summarizeFleet } from "@/lib/clusters"
import { ScoreRing } from "@/components/posture/score-ring"
import { ClusterCard } from "@/components/fleet/cluster-card"
import { SnapshotUploader } from "@/components/fleet/snapshot-uploader"
import { UpgradeDialog } from "@/components/app/upgrade-dialog"
import { UpgradeBanner } from "@/components/app/upgrade-banner"

const COLLECTOR_COMMAND = `kubectl get clusterroles,clusterrolebindings,roles,rolebindings \\
  -A -o json > rbac-snapshot.json`

export default function HomePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const searchParams = useSearchParams()
  const [scans, setScans] = useState<Scan[]>([])
  // Full scans for each cluster's latest snapshot — scoring needs findings.
  const [hydrated, setHydrated] = useState<Map<string, Scan>>(new Map())
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(searchParams.get("upload") === "true")
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const load = useCallback(async () => {
    const workspace = await getActiveWorkspace()
    setWorkspaceId(workspace?.id ?? null)
    if (!workspace) {
      setScans([])
      setLoading(false)
      return
    }
    const meta = await loadScansMeta(workspace.id)
    setScans(meta)
    setLoading(false)

    const latestIds = groupScansIntoClusters(meta).map((group) => group.latest.scan.id)
    setHydrated(await hydrateScans(workspace.id, latestIds))
  }, [])

  useEffect(() => {
    load()
    const onWorkspaceChange = () => load()
    window.addEventListener("kubescope-workspace-changed", onWorkspaceChange)
    return () => window.removeEventListener("kubescope-workspace-changed", onWorkspaceChange)
  }, [load])

  const clusters = useMemo(() => groupScansIntoClusters(scans, hydrated), [scans, hydrated])
  const fleet = useMemo(() => summarizeFleet(clusters), [clusters])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    )
  }

  // First run: nothing but the one thing the user needs to do. No zeroed metric
  // cards, no empty charts — a dashboard of zeros teaches nothing and looks broken.
  if (scans.length === 0) {
    return (
      <>
        <FirstRun onUpload={() => setUploadOpen(true)} />
        <SnapshotUploader
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUploaded={load}
          onScanLimit={() => setUpgradeOpen(true)}
        />
        <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} workspaceId={workspaceId} />
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fleet overview</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {fleet.clusterCount} cluster{fleet.clusterCount === 1 ? "" : "s"} · {fleet.snapshotCount} snapshot
            {fleet.snapshotCount === 1 ? "" : "s"}
            {fleet.lastScanAt && ` · last scan ${getTimeAgo(fleet.lastScanAt)}`}
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => setUploadOpen(true)}>
          <Upload className="w-4 h-4 mr-2" />
          Upload snapshot
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="data-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Fleet score</p>
          <div className="mt-2 flex items-center gap-3">
            <ScoreRing score={fleet.fleetScore} size="md" showBand={false} />
            <div>
              <p className="text-2xl font-semibold tabular leading-none">
                {fleet.fleetScore ?? <span className="text-muted-foreground">—</span>}
              </p>
              {/* Worst cluster, not the mean: averaging hides the one broken cluster,
                  which is the only one that matters. */}
              <p className="mt-1 text-xs text-muted-foreground">worst cluster</p>
            </div>
          </div>
        </div>

        <div className="data-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Critical</p>
          <p className="mt-2 text-3xl font-semibold tabular text-sev-critical leading-none">{fleet.totalCritical}</p>
          <p className="mt-2 text-xs text-muted-foreground">across all clusters</p>
        </div>

        <div className="data-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">High</p>
          <p className="mt-2 text-3xl font-semibold tabular text-sev-high leading-none">{fleet.totalHigh}</p>
          <p className="mt-2 text-xs text-muted-foreground">across all clusters</p>
        </div>

        <div className="data-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Needs attention</p>
          {fleet.staleClusters > 0 ? (
            <>
              <p className="mt-2 text-3xl font-semibold tabular text-sev-medium leading-none">
                {fleet.staleClusters}
              </p>
              <p className="mt-2 text-xs text-muted-foreground inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                not scanned in over 7 days
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-3xl font-semibold tabular text-sev-pass leading-none">0</p>
              <p className="mt-2 text-xs text-muted-foreground">all clusters recently scanned</p>
            </>
          )}
        </div>
      </div>

      <UpgradeBanner />

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Clusters</h2>
        <Link href="/app/clusters" className="text-sm text-primary hover:underline">
          Manage all clusters
        </Link>
      </div>

      <div className="space-y-4">
        {clusters.slice(0, 4).map((group) => (
          <ClusterCard key={group.id} group={group} />
        ))}
      </div>

      {clusters.length > 4 && (
        <Link href="/app/clusters">
          <Button variant="outline" className="rounded-xl bg-transparent">
            <Server className="w-4 h-4 mr-2" />
            View all {clusters.length} clusters
          </Button>
        </Link>
      )}

      <SnapshotUploader
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={load}
        onScanLimit={() => setUpgradeOpen(true)}
      />
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} workspaceId={workspaceId} />
    </div>
  )
}

function FirstRun({ onUpload }: { onUpload: () => void }) {
  const [copied, setCopied] = useState(false)
  const [dragging, setDragging] = useState(false)

  return (
    // The whole page is the drop target, not just the dashed box — first-time
    // users aim badly.
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onUpload()
      }}
      className={cn(
        "min-h-[70vh] flex flex-col items-center justify-center text-center rounded-3xl transition-colors",
        dragging && "bg-primary/5 ring-2 ring-primary/40",
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Sparkles className="w-7 h-7 text-primary" />
      </div>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Welcome to KubeScope</h1>
      <p className="mt-2 text-muted-foreground">Analyze your Kubernetes RBAC security posture.</p>

      <button
        type="button"
        onClick={onUpload}
        className="mt-8 w-full max-w-xl rounded-2xl border-2 border-dashed border-border hover:border-foreground/25 transition-colors p-10"
      >
        <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
        <p className="mt-4 font-medium">Drop your RBAC snapshot here</p>
        <p className="text-sm text-muted-foreground">or click to upload</p>
        <p className="mt-3 text-xs text-muted-foreground">Supported: .json · .zip</p>
      </button>

      <div className="mt-10 w-full max-w-xl text-left">
        <p className="text-sm font-medium">Don&apos;t have a snapshot yet?</p>
        <div className="mt-2 relative">
          <pre className="text-xs bg-muted rounded-xl p-4 pr-12 overflow-x-auto">{COLLECTOR_COMMAND}</pre>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(COLLECTOR_COMMAND)
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            }}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            aria-label="Copy command"
          >
            {copied ? <Check className="w-4 h-4 text-sev-pass" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Read-only. Nothing leaves your cluster except this file.
        </p>
      </div>

      <div className="mt-8">
        <Link href="/docs/getting-started">
          <Button variant="ghost" className="rounded-xl">
            <BookOpen className="w-4 h-4 mr-2" />
            Read the docs
          </Button>
        </Link>
      </div>
    </div>
  )
}
