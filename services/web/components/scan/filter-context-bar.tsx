"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useScan } from "./scan-context"

/** Query params that scope a whole analysis view and survive navigation. */
const TRACKED = [
  { key: "ns", label: "namespace" },
  { key: "severity", label: "severity" },
  { key: "kind", label: "kind" },
  { key: "domain", label: "domain" },
  { key: "q", label: "search" },
] as const

/**
 * A filter that survives navigation must always be visible.
 *
 * Invisible persistent filters are the most common cause of "the data is
 * wrong" reports in security tooling — the user sees a subset and believes it
 * is the whole picture.
 */
export function FilterContextBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { inventory } = useScan()

  const active = TRACKED.map(({ key, label }) => ({
    key: key as string,
    label: label as string,
    value: searchParams.get(key),
  })).filter((f): f is { key: string; label: string; value: string } => Boolean(f.value))

  if (active.length === 0) return null

  const setParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`)
  }

  const ns = searchParams.get("ns")
  // A namespace filter carried over from another snapshot may not exist here.
  const nsMissing =
    ns && ns !== "cluster-wide" && inventory.namespaces.length > 0 && !inventory.namespaces.includes(ns)

  return (
    <div className="-mx-6 px-6 py-2 border-b border-border bg-muted/30">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-muted-foreground">Filtered:</span>

        {active.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setParams((p) => p.delete(filter.key))}
            className="inline-flex items-center gap-1.5 rounded-full bg-background border border-border px-2.5 py-1 text-xs hover:border-foreground/30 transition-colors"
          >
            <span className="text-muted-foreground">{filter.label} =</span>
            <span className="font-medium">{filter.value}</span>
            <X className="w-3 h-3 opacity-60" />
          </button>
        ))}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            setParams((p) => {
              for (const { key } of TRACKED) p.delete(key)
            })
          }
        >
          Clear all
        </Button>
      </div>

      {nsMissing && (
        <p className="mt-2 flex items-center gap-2 text-xs text-sev-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Namespace <span className="font-medium">{ns}</span> doesn&apos;t exist in this snapshot — results will be
          empty.
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => setParams((p) => p.delete("ns"))}
          >
            Remove filter
          </button>
        </p>
      )}
    </div>
  )
}
