// Finding workflow state: open / resolved / suppressed.
//
// LIMITATION — READ THIS BEFORE RELYING ON IT:
// State is stored in localStorage, per workspace. That makes it per-browser and
// per-device: it is NOT shared with teammates and it is NOT an audit trail.
// Suppression with a recorded reason is what stops a security tool becoming a
// rubber stamp, so the reason is mandatory here — but durable, attributable
// storage needs a backend table (workspace_finding_status) and an API. Until
// that exists the UI states plainly that this is a local annotation.

export type FindingState = "open" | "resolved" | "suppressed"

export interface FindingStatusRecord {
  findingId: string
  state: FindingState
  reason?: string
  /** ISO date after which a suppression stops applying. */
  expiresAt?: string | null
  updatedAt: string
}

const key = (workspaceId: string, scanId: string) => `kubescope_finding_status_${workspaceId}_${scanId}`

function readAll(workspaceId: string, scanId: string): Record<string, FindingStatusRecord> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(localStorage.getItem(key(workspaceId, scanId)) || "{}")
  } catch {
    return {}
  }
}

function writeAll(workspaceId: string, scanId: string, records: Record<string, FindingStatusRecord>): void {
  if (typeof window === "undefined") return
  localStorage.setItem(key(workspaceId, scanId), JSON.stringify(records))
}

export function loadFindingStatuses(workspaceId: string, scanId: string): Record<string, FindingStatusRecord> {
  const records = readAll(workspaceId, scanId)
  const now = Date.now()
  let mutated = false

  // Expired suppressions revert to open — an expiry that never fires is not an
  // expiry.
  for (const [id, record] of Object.entries(records)) {
    if (record.state === "suppressed" && record.expiresAt && new Date(record.expiresAt).getTime() < now) {
      records[id] = { ...record, state: "open", reason: undefined, expiresAt: null, updatedAt: new Date().toISOString() }
      mutated = true
    }
  }
  if (mutated) writeAll(workspaceId, scanId, records)
  return records
}

export function setFindingStatus(
  workspaceId: string,
  scanId: string,
  findingId: string,
  state: FindingState,
  opts: { reason?: string; expiresAt?: string | null } = {},
): FindingStatusRecord {
  if (state === "suppressed" && !opts.reason?.trim()) {
    throw new Error("A suppression reason is required.")
  }
  const records = readAll(workspaceId, scanId)
  const record: FindingStatusRecord = {
    findingId,
    state,
    reason: opts.reason?.trim() || undefined,
    expiresAt: opts.expiresAt ?? null,
    updatedAt: new Date().toISOString(),
  }
  records[findingId] = record
  writeAll(workspaceId, scanId, records)
  return record
}

export function clearFindingStatus(workspaceId: string, scanId: string, findingId: string): void {
  const records = readAll(workspaceId, scanId)
  delete records[findingId]
  writeAll(workspaceId, scanId, records)
}

export function stateOf(
  statuses: Record<string, FindingStatusRecord>,
  findingId: string,
): FindingState {
  return statuses[findingId]?.state ?? "open"
}
