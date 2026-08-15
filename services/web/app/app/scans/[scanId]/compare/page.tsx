"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GitCompare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useScan } from "@/components/scan/scan-context"
import { clusterIdFor, clusterNameForScan } from "@/lib/clusters"
import { scoreForScan } from "@/lib/scoring"

/** Jumps straight to the previous snapshot; falls back to a picker. */
export default function CompareEntryPage() {
  const { scanId, previous, allScans, clusterName } = useScan()
  const router = useRouter()

  useEffect(() => {
    if (previous) router.replace(`/app/scans/${scanId}/compare/${previous.id}`)
  }, [previous, router, scanId])

  const siblings = useMemo(() => {
    const clusterId = clusterIdFor(clusterName)
    return allScans
      .filter((s) => clusterIdFor(clusterNameForScan(s)) === clusterId && s.id !== scanId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [allScans, clusterName, scanId])

  if (previous) return null

  return (
    <div className="max-w-xl">
      <div className="data-card p-8 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-4">
          <GitCompare className="w-6 h-6 text-muted-foreground" />
        </div>

        {siblings.length === 0 ? (
          <>
            <h1 className="text-lg font-semibold">Nothing to compare against</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This is the only snapshot of {clusterName}. Upload another one to see what changed.
            </p>
            <Link href="/app/clusters?upload=true">
              <Button className="mt-5 rounded-xl">Upload snapshot</Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Pick a baseline</h1>
            <p className="mt-1 text-sm text-muted-foreground">Compare this snapshot against an earlier one.</p>
            <div className="mt-5 space-y-2 text-left">
              {siblings.map((s) => (
                <Link
                  key={s.id}
                  href={`/app/scans/${scanId}/compare/${s.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:border-foreground/25 transition-colors"
                >
                  <span className="flex-1 text-sm">
                    {new Date(s.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="tabular text-sm text-muted-foreground">
                    {scoreForScan(s).available ? `score ${scoreForScan(s).score}` : "score —"}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
