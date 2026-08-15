"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { computeAttackSurface } from "@/lib/attack-surface"
import { useScan } from "@/components/scan/scan-context"

/**
 * Nine attack-surface tiles, each a saved query into Findings.
 *
 * Eight are derivable from RBAC. HostPath is a Pod Security concern
 * (securityContext / PSA) and simply is not present in an RBAC snapshot — it
 * renders as "not collected" rather than showing a number we cannot source.
 * A fabricated security metric is worse than an absent one.
 */
export function AttackSurfaceGrid() {
  const { scan, scanId } = useScan()
  const router = useRouter()
  const tiles = useMemo(() => computeAttackSurface(scan.dataset), [scan.dataset])

  return (
    <div className="data-card p-6">
      <h2 className="text-lg font-semibold mb-1">Attack surface</h2>
      <p className="text-sm text-muted-foreground mb-4">Each tile opens the findings behind it.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {tiles.map((tile) => {
          const unavailable = tile.availability === "not-collected"
          return (
            <button
              key={tile.id}
              type="button"
              disabled={unavailable}
              title={unavailable ? tile.unavailableReason : tile.hint}
              onClick={() => router.push(`/app/scans/${scanId}/findings${tile.query}`)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                unavailable
                  ? "border-dashed border-border text-muted-foreground cursor-default"
                  : "border-border hover:border-foreground/25 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <p className="text-xs text-muted-foreground leading-tight flex items-center gap-1">
                {tile.label}
                {unavailable && <Info className="w-3 h-3 shrink-0" />}
              </p>
              {unavailable ? (
                <p className="mt-1.5 text-sm font-medium">Not collected</p>
              ) : (
                <p
                  className={cn(
                    "mt-1.5 text-2xl font-semibold tabular leading-none",
                    tile.count === 0 ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {tile.count}
                </p>
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        HostPath and privileged containers need pod specs — extend the collector to include workloads.
      </p>
    </div>
  )
}
