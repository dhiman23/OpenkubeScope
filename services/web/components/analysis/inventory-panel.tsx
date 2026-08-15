"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { inventoryRows } from "@/lib/inventory"
import { describeScope, namespaceStats } from "@/lib/namespaces"
import { useScan } from "@/components/scan/scan-context"

const GROUP_TITLE = {
  identities: "Identities",
  authorization: "Authorization",
  bindings: "Bindings",
} as const

/**
 * The real object breakdown, every row a filtered link into the Viewer.
 *
 * Two things were inconsistent here and are fixed:
 *   - Rows only revealed their chevron on hover, so at rest nothing looked
 *     clickable and a keyboard user got no cue at all. Every row now carries a
 *     persistent chevron, a hover state, a visible focus ring, and a pointer
 *     cursor — and total rows are visually distinct from the category rows
 *     above them rather than differing only by a hairline.
 *   - The namespace count sat next to object counts as if it were one, with a
 *     bare "—" when unknown. It now uses the agreed scope phrasing, which keeps
 *     cluster-wide out of the namespace count.
 */
export function InventoryPanel() {
  const { inventory, scanId, scan } = useScan()
  const rows = inventoryRows(inventory, scanId)
  const stats = namespaceStats(scan.dataset)

  const groups = (["identities", "authorization", "bindings"] as const).map((group) => ({
    group,
    rows: rows.filter((row) => row.group === group),
  }))

  return (
    <div className="data-card p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-semibold">RBAC inventory</h2>
        <Link
          href={`/app/scans/${scanId}/inventory`}
          className="rounded text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Full inventory
        </Link>
      </div>

      <div className="space-y-5">
        {groups.map(({ group, rows: groupRows }) => (
          <div key={group}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{GROUP_TITLE[group]}</p>
            <div className="space-y-0.5">
              {groupRows.map((row) => (
                <Link
                  key={row.label}
                  href={row.href}
                  aria-label={`${row.label}: ${row.value}. Open in RBAC viewer.`}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-2 py-1.5 cursor-pointer transition-colors",
                    "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    // A total is a summary of the rows above it, not a peer.
                    row.emphasis && "mt-1 border-t border-border pt-2 bg-muted/30",
                  )}
                >
                  <span className={cn("flex-1 truncate text-sm", row.emphasis && "font-medium")}>{row.label}</span>
                  <span className="tabular text-sm font-medium">{row.value}</span>
                  <ChevronRight
                    className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70 group-hover:text-foreground transition-colors"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Scope</p>
          <p className="font-medium">{describeScope(stats)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Permission rules</p>
          <p className="tabular font-medium">{inventory.permissionRules || "—"}</p>
        </div>
      </div>
    </div>
  )
}
