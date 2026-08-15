"use client"

import React, { createContext, useContext, useMemo } from "react"
import type { Scan } from "@/lib/rbac-scanner"
import { computeInventory, type InventoryCounts } from "@/lib/inventory"
import { evaluateCompliance, type ComplianceResult } from "@/lib/compliance"
import { computeNamespaceScores, scoreForScan, type NamespaceScore, type ScoreResult } from "@/lib/scoring"
import { previousSnapshotOf, clusterNameForScan, inferEnvironment, type Environment } from "@/lib/clusters"

/**
 * The analysis layout owns the scan; every page consumes it from here.
 *
 * Previously each page re-derived the "active scan" independently and listened
 * to a kubescope-scan-updated CustomEvent, which meant duplicate fetches and
 * pages that could disagree about what was on screen. The scan id now comes
 * from the route, so there is exactly one source of truth.
 */
export interface ScanContextValue {
  scan: Scan
  scanId: string
  workspaceId: string
  /** Metadata for every scan in the workspace — powers the switcher. */
  allScans: Scan[]
  /** Previous completed snapshot of the same cluster, or null for a first scan. */
  previous: Scan | null
  clusterName: string
  environment: Environment
  score: ScoreResult
  previousScore: ScoreResult | null
  compliance: ComplianceResult
  inventory: InventoryCounts
  namespaceScores: NamespaceScore[]
  refresh: () => void
}

const ScanContext = createContext<ScanContextValue | null>(null)

export function ScanProvider({
  scan,
  workspaceId,
  allScans,
  refresh,
  children,
}: {
  scan: Scan
  workspaceId: string
  allScans: Scan[]
  refresh: () => void
  children: React.ReactNode
}) {
  const value = useMemo<ScanContextValue>(() => {
    const findings = scan.dataset?.findings ?? []
    const surface = scan.totals?.roles || findings.length || 1
    const previous = previousSnapshotOf([...allScans], scan.id)
    const clusterName = clusterNameForScan(scan)

    return {
      scan,
      scanId: scan.id,
      workspaceId,
      allScans,
      previous,
      clusterName,
      environment: inferEnvironment(clusterName),
      score: scoreForScan(scan),
      previousScore: previous ? scoreForScan(previous) : null,
      compliance: evaluateCompliance(scan.dataset),
      inventory: computeInventory(scan.dataset),
      namespaceScores: computeNamespaceScores(findings, surface),
      refresh,
    }
  }, [scan, workspaceId, allScans, refresh])

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>
}

export function useScan(): ScanContextValue {
  const context = useContext(ScanContext)
  if (!context) {
    throw new Error("useScan must be used inside an analysis route (/app/scans/[scanId])")
  }
  return context
}

/** Non-throwing variant for chrome rendered outside the analysis layout. */
export function useScanOptional(): ScanContextValue | null {
  return useContext(ScanContext)
}
