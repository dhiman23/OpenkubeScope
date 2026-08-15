"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Command } from "cmdk"
import {
  AlertTriangle,
  Boxes,
  Download,
  FileText,
  GitCompare,
  Layers,
  LayoutDashboard,
  Map,
  Server,
  Settings,
  Upload,
  Users,
} from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { loadScansMeta } from "@/lib/rbac-scanner"
import { getActiveWorkspaceId } from "@/lib/workspace-manager"
import { clusterNameForScan } from "@/lib/clusters"
import { scoreForScan } from "@/lib/scoring"
import type { Scan } from "@/lib/rbac-scanner"

/**
 * The ⌘K palette.
 *
 * The header previously rendered a search input with a ⌘K hint and no handler
 * at all. A visible affordance that does nothing is worse than no affordance,
 * so this replaces it with a working one: jump to any cluster or snapshot, and
 * run the actions available for the scan currently open.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [scans, setScans] = useState<Scan[]>([])
  const [loaded, setLoaded] = useState(false)

  const scanId = /^\/app\/scans\/([^/]+)/.exec(pathname)?.[1] ?? null

  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    ;(async () => {
      const workspaceId = await getActiveWorkspaceId()
      if (!workspaceId) {
        if (!cancelled) setLoaded(true)
        return
      }
      const list = await loadScansMeta(workspaceId)
      if (cancelled) return
      setScans(list)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [open, loaded])

  const go = useCallback(
    (href: string) => {
      onOpenChange(false)
      router.push(href)
    },
    [onOpenChange, router],
  )

  const scanActions = useMemo(() => {
    if (!scanId) return []
    const base = `/app/scans/${scanId}`
    return [
      { label: "Dashboard", icon: LayoutDashboard, href: base },
      { label: "Risk Findings", icon: AlertTriangle, href: `${base}/findings` },
      { label: "Critical findings only", icon: AlertTriangle, href: `${base}/findings?severity=critical` },
      { label: "RBAC Viewer", icon: Users, href: `${base}/viewer` },
      { label: "Service accounts", icon: Users, href: `${base}/viewer?kind=ServiceAccount` },
      { label: "RBAC Map", icon: Map, href: `${base}/map` },
      { label: "Inventory", icon: Boxes, href: `${base}/inventory` },
      { label: "Namespace posture", icon: Layers, href: `${base}/namespaces` },
      { label: "Compare with previous", icon: GitCompare, href: `${base}/compare` },
      { label: "Reports for this snapshot", icon: FileText, href: `${base}/reports` },
    ]
  }, [scanId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 sm:max-w-2xl overflow-hidden">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command loop className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
          <div className="border-b border-border px-3">
            <Command.Input
              autoFocus
              placeholder="Search clusters, snapshots and actions…"
              className="w-full h-12 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>

          <Command.List className="max-h-[420px] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              {loaded ? "No matches." : "Loading…"}
            </Command.Empty>

            {scanActions.length > 0 && (
              <Command.Group heading="This snapshot">
                {scanActions.map((action) => (
                  <Item key={action.href} onSelect={() => go(action.href)} icon={action.icon}>
                    {action.label}
                  </Item>
                ))}
              </Command.Group>
            )}

            {scans.length > 0 && (
              <Command.Group heading="Snapshots">
                {scans.slice(0, 25).map((scan) => (
                  <Item
                    key={scan.id}
                    value={`${clusterNameForScan(scan)} ${scan.fileName} ${scan.createdAt}`}
                    onSelect={() => go(`/app/scans/${scan.id}`)}
                    icon={Server}
                    trailing={scoreForScan(scan).available ? String(scoreForScan(scan).score) : undefined}
                  >
                    <span className="truncate">{clusterNameForScan(scan)}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {new Date(scan.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Go to">
              <Item onSelect={() => go("/app")} icon={LayoutDashboard}>
                Home
              </Item>
              <Item onSelect={() => go("/app/clusters")} icon={Server}>
                Clusters
              </Item>
              <Item onSelect={() => go("/app/clusters?upload=true")} icon={Upload}>
                Upload snapshot
              </Item>
              <Item onSelect={() => go("/app/reports")} icon={FileText}>
                Reports
              </Item>
              <Item onSelect={() => go("/app/settings")} icon={Settings}>
                Settings
              </Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function Item({
  children,
  onSelect,
  icon: Icon,
  value,
  trailing,
}: {
  children: React.ReactNode
  onSelect: () => void
  icon: typeof Download
  value?: string
  trailing?: string
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
    >
      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 flex items-center min-w-0">{children}</span>
      {trailing && <span className="tabular text-xs text-muted-foreground">{trailing}</span>}
    </Command.Item>
  )
}

/** Registers the ⌘K / Ctrl+K shortcut. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return { open, setOpen }
}
