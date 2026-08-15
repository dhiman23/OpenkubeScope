"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FindingCard } from "@/components/analysis/finding-card"
import { useScan } from "@/components/scan/scan-context"
import {
  clearFindingStatus,
  loadFindingStatuses,
  setFindingStatus,
  stateOf,
  type FindingState,
  type FindingStatusRecord,
} from "@/lib/finding-status"

/** Deep link target for "Copy link" — a finding is addressable on its own. */
export default function FindingDetailPage() {
  const { scan, scanId, workspaceId } = useScan()
  const params = useParams<{ findingId: string }>()
  const findingId = params?.findingId

  const [statuses, setStatuses] = useState<Record<string, FindingStatusRecord>>({})

  useEffect(() => {
    setStatuses(loadFindingStatuses(workspaceId, scanId))
  }, [workspaceId, scanId])

  const finding = (scan.dataset?.findings ?? []).find((f) => f.id === findingId)

  if (!finding) {
    return (
      <div className="data-card p-10 text-center">
        <p className="font-medium">Finding not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          It may belong to a different snapshot, or the role it referenced no longer exists.
        </p>
        <Link href={`/app/scans/${scanId}/findings`}>
          <Button className="mt-5 rounded-xl">All findings</Button>
        </Link>
      </div>
    )
  }

  const updateStatus = (state: FindingState, opts?: { reason?: string; expiresAt?: string | null }) => {
    if (state === "open") clearFindingStatus(workspaceId, scanId, finding.id)
    else setFindingStatus(workspaceId, scanId, finding.id, state, opts)
    setStatuses(loadFindingStatuses(workspaceId, scanId))
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Link
        href={`/app/scans/${scanId}/findings`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        All findings
      </Link>

      <FindingCard
        finding={finding}
        scanId={scanId}
        state={stateOf(statuses, finding.id)}
        reason={statuses[finding.id]?.reason}
        expanded
        onToggle={() => {}}
        onSetState={updateStatus}
      />
    </div>
  )
}
