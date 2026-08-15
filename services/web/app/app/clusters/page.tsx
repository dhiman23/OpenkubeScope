"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight, Loader2, Search, Server, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { getTimeAgo } from "@/lib/format-utils"
import { deleteScan, type Scan } from "@/lib/rbac-scanner"
import { hydrateScans, loadScansMeta } from "@/lib/scan-storage"
import { getActiveWorkspace } from "@/lib/workspace-manager"
import {
  clusterNameForScan,
  ENV_LABEL,
  groupScansIntoClusters,
  inferEnvironment,
  type Environment,
} from "@/lib/clusters"
import { scoreForScan } from "@/lib/scoring"
import { ScoreRing } from "@/components/posture/score-ring"
import { ClusterCard } from "@/components/fleet/cluster-card"
import { SnapshotUploader } from "@/components/fleet/snapshot-uploader"
import { UpgradeDialog } from "@/components/app/upgrade-dialog"
import Loading from "./loading"

type ViewMode = "grouped" | "flat"
type SortMode = "risk" | "recent" | "name"

export default function ClustersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ClustersContent />
    </Suspense>
  )
}

function ClustersContent() {
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [scans, setScans] = useState<Scan[]>([])
  // Full scans for each cluster's latest snapshot — scoring needs findings.
  const [hydrated, setHydrated] = useState<Map<string, Scan>>(new Map())
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(searchParams.get("upload") === "true")
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const [view, setView] = useState<ViewMode>("grouped")
  const [sort, setSort] = useState<SortMode>("risk")
  const [envFilter, setEnvFilter] = useState<Environment | "">("")
  const [query, setQuery] = useState("")

  // Remember the view preference — some teams live in one, some in the other.
  useEffect(() => {
    const stored = localStorage.getItem("kubescope_clusters_view") as ViewMode | null
    if (stored === "grouped" || stored === "flat") setView(stored)
  }, [])

  useEffect(() => {
    localStorage.setItem("kubescope_clusters_view", view)
  }, [view])

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

  const handleDelete = async (scanId: string) => {
    setScans((prev) => prev.filter((s) => s.id !== scanId))
    await deleteScan(scanId)
    toast({ description: "Snapshot deleted." })
    await load()
  }

  const filteredScans = useMemo(() => {
    const q = query.toLowerCase().trim()
    return scans.filter((scan) => {
      const name = clusterNameForScan(scan)
      if (envFilter && inferEnvironment(name) !== envFilter) return false
      if (q && !`${name} ${scan.fileName}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [scans, query, envFilter])

  const clusters = useMemo(() => {
    const groups = groupScansIntoClusters(filteredScans, hydrated)
    if (sort === "recent") {
      return [...groups].sort(
        (a, b) => new Date(b.latest.scan.createdAt).getTime() - new Date(a.latest.scan.createdAt).getTime(),
      )
    }
    if (sort === "name") return [...groups].sort((a, b) => a.name.localeCompare(b.name))
    return groups // already worst-first
  }, [filteredScans, sort, hydrated])

  const flatScans = useMemo(() => {
    const list = [...filteredScans]
    if (sort === "name") return list.sort((a, b) => clusterNameForScan(a).localeCompare(clusterNameForScan(b)))
    if (sort === "risk") {
      // Unscored snapshots sort last: unknown is not the same as safe.
      const scoreOf = (scan: Scan) => {
        const result = scoreForScan(hydrated.get(scan.id) ?? scan)
        return result.available ? result.score : 101
      }
      return list.sort((a, b) => scoreOf(a) - scoreOf(b))
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [filteredScans, sort, hydrated])

  if (loading) return <Loading />

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clusters</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {clusters.length} cluster{clusters.length === 1 ? "" : "s"} · {scans.length} snapshot
            {scans.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => setUploadOpen(true)}>
          <Upload className="w-4 h-4 mr-2" />
          Upload snapshot
        </Button>
      </div>

      {scans.length === 0 ? (
        <div className="data-card p-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Server className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-medium">No snapshots in this workspace</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload an RBAC snapshot to start analyzing a cluster.
          </p>
          <Button className="mt-5 rounded-xl" onClick={() => setUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload snapshot
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Grouped is the default: one card per cluster scales to nightly
                scanning, where a flat list becomes 365 near-identical cards a
                year. The flat view stays available for anyone who wants it. */}
            <div className="flex rounded-xl border border-border overflow-hidden">
              {(
                [
                  ["grouped", "Grouped by cluster"],
                  ["flat", "All snapshots"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium transition-colors",
                    view === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="risk">Sort: worst first</option>
              <option value="recent">Sort: last scanned</option>
              <option value="name">Sort: name</option>
            </select>

            <select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value as Environment | "")}
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">All environments</option>
              <option value="prod">Production</option>
              <option value="staging">Staging</option>
              <option value="dev">Development</option>
              <option value="unlabelled">Unlabelled</option>
            </select>

            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clusters and snapshots…"
                className="pl-9 h-9 rounded-xl"
              />
            </div>
          </div>

          {filteredScans.length === 0 ? (
            <div className="data-card p-10 text-center">
              <p className="font-medium">Nothing matches these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try clearing the search or environment filter.</p>
            </div>
          ) : view === "grouped" ? (
            <div className="space-y-4">
              {clusters.map((group) => (
                <ClusterCard key={group.id} group={group} onDelete={handleDelete} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {flatScans.map((scan) => (
                <SnapshotCard key={scan.id} scan={scan} full={hydrated.get(scan.id)} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </>
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

function SnapshotCard({
  scan,
  full,
  onDelete,
}: {
  scan: Scan
  full?: Scan
  onDelete: (scanId: string) => void
}) {
  const name = clusterNameForScan(scan)
  const env = inferEnvironment(name)
  const result = scoreForScan(full ?? scan)
  const score = result.available ? result.score : null
  const status = scan.status ?? "completed"

  return (
    <div className="data-card p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{name}</h3>
          <p className="text-xs text-muted-foreground truncate">{scan.fileName}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground shrink-0">
          {ENV_LABEL[env]}
        </span>
      </div>

      {status === "failed" ? (
        <p className="mt-4 text-sm text-sev-critical">{scan.errorMessage || "Analysis failed"}</p>
      ) : status === "pending" ? (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-sev-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…
        </p>
      ) : (
        <div className="mt-4 flex items-center gap-4">
          <ScoreRing score={score} size="md" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-sev-critical tabular">C {scan.riskCounts?.critical ?? 0}</span>
            <span className="text-sev-high tabular">H {scan.riskCounts?.high ?? 0}</span>
            <span className="text-muted-foreground tabular">{scan.totals?.subjects ?? 0} subj</span>
            <span className="text-muted-foreground tabular">{scan.totals?.roles ?? 0} roles</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">{getTimeAgo(scan.createdAt)}</p>

      <div className="mt-4 pt-3 border-t border-border flex items-center gap-2">
        <Link href={`/app/scans/${scan.id}`} className="flex-1">
          <Button size="sm" className="rounded-xl w-full">
            Open Analysis
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(scan.id)}
          aria-label="Delete snapshot"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
