import type { Scan } from "@/lib/rbac-scanner"

export function getTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? "s" : ""} ago`
}

export function getTotalRisks(scan: Scan): number {
  if (!scan.riskCounts) return 0
  return (
    (scan.riskCounts.critical || 0) +
    (scan.riskCounts.high || 0) +
    (scan.riskCounts.medium || 0) +
    (scan.riskCounts.low || 0)
  )
}
