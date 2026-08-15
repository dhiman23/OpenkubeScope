"use client"

import { useMemo } from "react"
import Link from "next/link"
import { Users, User, Settings2 } from "lucide-react"
import { computeDangerousSubjects } from "@/lib/recommended-actions"
import { useScan } from "@/components/scan/scan-context"

const KIND_ICON: Record<string, typeof User> = {
  User,
  Group: Users,
  ServiceAccount: Settings2,
}

/** Role-level findings rolled up to the identities that actually hold the access. */
export function TopDangerousSubjects() {
  const { scan, scanId } = useScan()
  const subjects = useMemo(
    () => computeDangerousSubjects(scan.dataset?.findings ?? []),
    [scan.dataset?.findings],
  )

  return (
    <div className="data-card p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-semibold">Top dangerous subjects</h2>
        <Link href={`/app/scans/${scanId}/viewer`} className="text-sm text-primary hover:underline">
          All subjects
        </Link>
      </div>

      {subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No findings resolve to a bound subject in this snapshot. Roles with findings may not be bound to anything —
          check the Findings page.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {subjects.map((subject) => {
            const Icon = KIND_ICON[subject.kind] ?? User
            return (
              <div key={subject.key} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-muted shrink-0">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{subject.name}</p>
                      <span className="text-xs text-muted-foreground">{subject.kind}</span>
                      <span className="text-xs text-muted-foreground">· {subject.namespace}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground truncate" title={subject.reasons.join(" · ")}>
                      {subject.reasons.join(" · ") || "Excess permissions"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="tabular text-sm font-semibold">{subject.score}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {subject.criticalCount > 0 ? `${subject.criticalCount} critical` : `${subject.findingCount} findings`}
                    </p>
                  </div>
                </div>
                <div className="mt-2 pl-9 flex gap-3">
                  <Link
                    href={`/app/scans/${scanId}/viewer?q=${encodeURIComponent(subject.name)}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Open in Viewer
                  </Link>
                  <Link
                    href={`/app/scans/${scanId}/map?focus=${encodeURIComponent(`subject:${subject.kind}:${subject.namespace === "cluster-wide" ? "-" : subject.namespace}/${subject.name}`)}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Open in Map
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
