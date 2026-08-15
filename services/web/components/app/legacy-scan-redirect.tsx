"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getActiveScanId, loadScansMeta } from "@/lib/scan-storage"
import { getActiveWorkspaceId } from "@/lib/workspace-manager"

/**
 * Keeps pre-redesign links working.
 *
 * The remembered scan id is used ONLY to resolve a legacy URL. It is never
 * used to silently populate an analysis view — if nothing can be resolved the
 * user lands on Home and picks, which is the whole point of the redesign.
 */
export function LegacyScanRedirect({ suffix }: { suffix: string }) {
  const router = useRouter()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const workspaceId = await getActiveWorkspaceId()
      if (!workspaceId) {
        if (!cancelled) setFailed(true)
        return
      }

      const remembered = await getActiveScanId(workspaceId)
      const scans = await loadScansMeta(workspaceId)
      if (cancelled) return

      const target =
        (remembered && scans.find((s) => s.id === remembered)?.id) ??
        scans.find((s) => (s.status ?? "completed") === "completed")?.id

      if (target) router.replace(`/app/scans/${target}${suffix}`)
      else setFailed(true)
    })()

    return () => {
      cancelled = true
    }
  }, [router, suffix])

  if (failed) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center max-w-sm">
          <h2 className="text-lg font-semibold">Pick a snapshot first</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Analysis pages belong to one snapshot. Choose which cluster you want to look at.
          </p>
          <Link href="/app/clusters">
            <Button className="mt-5 rounded-xl">Go to clusters</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
    </div>
  )
}
