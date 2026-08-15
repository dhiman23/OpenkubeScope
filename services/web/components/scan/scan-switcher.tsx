"use client"

import { useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Check, ChevronDown, GitCompare, LayoutGrid, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { clusterIdFor, clusterNameForScan } from "@/lib/clusters"
import { scoreForScan } from "@/lib/scoring"
import { useScan } from "./scan-context"

/** "—" when the snapshot's dataset was not loaded — never a substitute number. */
function formatScore(scan: Parameters<typeof scoreForScan>[0]): string {
  const result = scoreForScan(scan)
  return result.available ? String(result.score) : "—"
}

function formatStamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

/**
 * Switching scans keeps you on the same page type and preserves filters.
 *
 *   /app/scans/AUG13/findings?severity=critical
 *        -> /app/scans/AUG12/findings?severity=critical
 *
 * It never bounces you back to a dashboard: losing your place is what makes
 * comparing two snapshots feel like starting over.
 */
export function ScanSwitcher({ compact = false }: { compact?: boolean }) {
  const { scan, allScans, clusterName } = useScan()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState("")

  const currentCluster = clusterIdFor(clusterName)

  const { sameCluster, otherClusters } = useMemo(() => {
    const filtered = allScans.filter((s) => {
      if (!query.trim()) return true
      const haystack = `${clusterNameForScan(s)} ${s.fileName} ${s.createdAt}`.toLowerCase()
      return haystack.includes(query.trim().toLowerCase())
    })

    const same = filtered
      .filter((s) => clusterIdFor(clusterNameForScan(s)) === currentCluster)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const others = new Map<string, (typeof filtered)[number]>()
    for (const s of filtered) {
      const id = clusterIdFor(clusterNameForScan(s))
      if (id === currentCluster) continue
      const existing = others.get(id)
      if (!existing || new Date(s.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        others.set(id, s)
      }
    }

    return { sameCluster: same, otherClusters: Array.from(others.values()) }
  }, [allScans, currentCluster, query])

  const switchTo = (scanId: string) => {
    // Preserve the sub-route and every query param.
    const suffix = pathname.replace(/^\/app\/scans\/[^/]+/, "")
    const qs = searchParams.toString()
    router.push(`/app/scans/${scanId}${suffix}${qs ? `?${qs}` : ""}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("rounded-xl gap-2 bg-transparent", compact ? "h-8 text-xs" : "h-9")}>
          <span className="truncate max-w-[190px]">
            {compact ? formatStamp(scan.createdAt) : `Scan: ${clusterName} · ${formatStamp(scan.createdAt)}`}
          </span>
          <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[340px] max-h-[520px] overflow-y-auto">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter snapshots…"
              className="h-8 pl-8 text-sm"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        {sameCluster.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
              {clusterName}
            </DropdownMenuLabel>
            {sameCluster.slice(0, 12).map((s) => {
              const isCurrent = s.id === scan.id
              return (
                <DropdownMenuItem
                  key={s.id}
                  onClick={() => switchTo(s.id)}
                  className="cursor-pointer gap-2"
                >
                  {isCurrent ? (
                    <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}
                  <span className="flex-1 truncate text-sm">{formatStamp(s.createdAt)}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {formatScore(s)} · C{s.riskCounts?.critical ?? 0}
                  </span>
                </DropdownMenuItem>
              )
            })}
            {sameCluster.length > 12 && (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                ⋯ {sameCluster.length - 12} more snapshots
              </DropdownMenuItem>
            )}
          </>
        )}

        {otherClusters.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
              Other clusters
            </DropdownMenuLabel>
            {otherClusters.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => switchTo(s.id)} className="cursor-pointer gap-2">
                <span className="w-3.5 shrink-0" />
                <span className="flex-1 truncate text-sm">{clusterNameForScan(s)}</span>
                <span className="tabular text-xs text-muted-foreground">{formatScore(s)}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push(`/app/scans/${scan.id}/compare`)}
          className="cursor-pointer gap-2"
        >
          <GitCompare className="w-4 h-4" />
          Compare with previous
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/app/clusters")} className="cursor-pointer gap-2">
          <LayoutGrid className="w-4 h-4" />
          Manage all clusters
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
