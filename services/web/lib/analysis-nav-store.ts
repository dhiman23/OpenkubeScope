// Tiny external store so the app-level sidebar can show a findings badge for
// the scan currently open, without refetching it.
//
// The sidebar is rendered by AppShell, which sits ABOVE the analysis route
// group, so it cannot read ScanContext. Rather than duplicate the fetch (the
// old sidebar did exactly that, via getActiveScan + a CustomEvent listener),
// the analysis layout publishes the few numbers the sidebar needs.

export interface AnalysisNavState {
  scanId: string | null
  /** Open critical + high only. A badge counting Low findings is noise. */
  openHighSeverity: number
}

let state: AnalysisNavState = { scanId: null, openHighSeverity: 0 }
const listeners = new Set<() => void>()

export function setAnalysisNavState(next: AnalysisNavState): void {
  if (state.scanId === next.scanId && state.openHighSeverity === next.openHighSeverity) return
  state = next
  for (const listener of listeners) listener()
}

export function clearAnalysisNavState(): void {
  setAnalysisNavState({ scanId: null, openHighSeverity: 0 })
}

export function subscribeAnalysisNav(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAnalysisNavState(): AnalysisNavState {
  return state
}

/** Server snapshot — the badge is client-only state. */
export function getAnalysisNavServerState(): AnalysisNavState {
  return { scanId: null, openHighSeverity: 0 }
}
