"use client"

import Link from "next/link"
import { CheckCircle2, ChevronRight, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { inventoryRows } from "@/lib/inventory"
import { useScan } from "@/components/scan/scan-context"

/** Full inventory plus the CIS control detail behind the compliance number. */
export default function InventoryPage() {
  const { inventory, compliance, scanId } = useScan()
  const rows = inventoryRows(inventory, scanId)

  const groups = [
    { key: "identities", title: "Identities" },
    { key: "authorization", title: "Authorization" },
    { key: "bindings", title: "Bindings" },
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">RBAC inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every object in this snapshot. Each row opens the viewer filtered to it.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {groups.map((group) => (
          <div key={group.key} className="data-card p-5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">{group.title}</p>
            <div className="space-y-0.5">
              {rows
                .filter((row) => row.group === group.key)
                .map((row) => (
                  <Link
                    key={row.label}
                    href={row.href}
                    className={cn(
                      "flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors group",
                      row.emphasis && "border-t border-border mt-1 pt-2.5",
                    )}
                  >
                    <span className={cn("flex-1 text-sm", row.emphasis && "font-medium")}>{row.label}</span>
                    <span className="tabular font-medium">{row.value}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="data-card p-5">
        <h2 className="text-lg font-semibold mb-3">Namespaces</h2>
        {inventory.namespaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No namespaced objects — this snapshot contains only cluster-scoped RBAC.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {inventory.namespaces.map((ns) => (
              <Link
                key={ns}
                href={`/app/scans/${scanId}/findings?ns=${encodeURIComponent(ns)}`}
                className="text-xs rounded-full border border-border px-2.5 py-1 hover:border-foreground/25 transition-colors"
              >
                {ns}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div id="compliance" className="data-card p-5 scroll-mt-32">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <h2 className="text-lg font-semibold">Compliance</h2>
          <span className="tabular text-sm">
            <span className="font-semibold">{compliance.passed}</span>
            <span className="text-muted-foreground"> / {compliance.total} controls passing</span>
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{compliance.framework}</p>

        <div className="divide-y divide-border">
          {compliance.controls.map((control) => (
            <div key={control.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                {control.status === "pass" ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-sev-pass shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 mt-0.5 text-sev-critical shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">
                    <span className="text-muted-foreground tabular mr-2">{control.id}</span>
                    {control.title}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{control.rationale}</p>

                  {control.status === "fail" && (
                    <>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {control.offenders.length} offending object{control.offenders.length === 1 ? "" : "s"}:{" "}
                        <span className="text-foreground">{control.offenders.slice(0, 4).join(", ")}</span>
                        {control.offenders.length > 4 && ` +${control.offenders.length - 4} more`}
                      </p>
                      <p className="mt-1.5 text-sm">{control.remediation}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Compliance is not the security score. The score measures how much of the authorization surface is
          compromised; this measures how many named controls of a published framework pass. Controls that need pod
          specs or API-server flags are deliberately absent rather than guessed at.
        </p>
      </div>
    </div>
  )
}
