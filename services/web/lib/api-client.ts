// REST client for core-api (the BFF). Replaces direct Supabase calls from the
// browser. Stores the JWT in localStorage and attaches it as a Bearer token.
//
// Base URL is NEXT_PUBLIC_CORE_API_URL (e.g. http://localhost:8080/api).

const BASE_URL = process.env.NEXT_PUBLIC_CORE_API_URL || "http://localhost:8080/api"
const TOKEN_KEY = "kubescope_token"

export interface AuthUser {
  id: string
  email: string | null
  username: string | null
}

export interface AuthResult {
  token: string
  user: AuthUser
  mustChange: boolean
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  // Multipart upload — pass a FormData instead of a JSON body.
  form?: FormData
  // Set false for unauthenticated calls (login/signup).
  auth?: boolean
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, auth = true } = opts
  const headers: Record<string, string> = {}

  if (auth) {
    const token = getToken()
    if (token) headers["Authorization"] = `Bearer ${token}`
  }

  let payload: BodyInit | undefined
  if (form) {
    payload = form // browser sets the multipart Content-Type + boundary
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    payload = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload })
  } catch {
    // Network/connection failure (e.g. core-api not running). Surface a clear,
    // catchable error instead of a raw "Failed to fetch".
    throw new ApiError(0, "Cannot reach the server. Please try again in a moment.")
  }

  if (res.status === 204) return undefined as T

  const isJson = res.headers.get("content-type")?.includes("application/json")
  const data = isJson ? await res.json().catch(() => ({})) : await res.text()

  if (!res.ok) {
    // A 401 on an authenticated call means the token is missing/expired/stale
    // (e.g. the user was deleted, or the secret rotated). Self-heal: drop the
    // token and bounce to login instead of leaving the app wedged.
    if (res.status === 401 && auth) {
      handleAuthExpiry()
    }
    const message = (isJson && (data as { error?: string }).error) || res.statusText
    const code = isJson ? (data as { code?: string }).code : undefined
    throw new ApiError(res.status, message, code)
  }

  return data as T
}

// Clears the session and redirects to login. Guarded so it only fires once per
// expiry and never during SSR.
let redirectingToLogin = false
function handleAuthExpiry(): void {
  if (typeof window === "undefined") return
  clearToken()
  if (redirectingToLogin) return
  if (window.location.pathname.startsWith("/auth/")) return
  redirectingToLogin = true
  window.location.href = "/auth/login"
}

// Download a file (report) as a Blob, with auth.
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    throw new ApiError(res.status, `Download failed (${res.status})`)
  }
  const disposition = res.headers.get("content-disposition") || ""
  const match = disposition.match(/filename="?([^"]+)"?/)
  return { blob: await res.blob(), filename: match?.[1] || "report" }
}

// ---- auth ----
export const authApi = {
  login: (identifier: string, password: string) =>
    apiFetch<AuthResult>("/auth/login", { method: "POST", auth: false, body: { username: identifier, password } }),

  signup: (email: string, password: string) =>
    apiFetch<AuthResult>("/auth/signup", { method: "POST", auth: false, body: { email, password } }),

  changeCredentials: (currentPassword: string, newUsername: string, newPassword: string) =>
    apiFetch<AuthResult>("/auth/change-credentials", { method: "POST", body: { currentPassword, newUsername, newPassword } }),
}

// ---- data APIs (core-api REST). Shapes mirror core-api's JSON responses. ----

export interface ApiWorkspace {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface ApiCluster {
  id: string
  workspace_id: string
  name: string
  status: string
  created_at: string
  updated_at: string
}

export const workspacesApi = {
  list: () => apiFetch<{ workspaces: ApiWorkspace[] }>("/workspaces").then((r) => r.workspaces),
  create: (name: string, description?: string) =>
    apiFetch<{ workspace: ApiWorkspace }>("/workspaces", { method: "POST", body: { name, description } }).then((r) => r.workspace),
  update: (id: string, updates: { name?: string; description?: string }) =>
    apiFetch<{ workspace: ApiWorkspace }>(`/workspaces/${id}`, { method: "PATCH", body: updates }).then((r) => r.workspace),
  remove: (id: string) => apiFetch<{ deleted: boolean }>(`/workspaces/${id}`, { method: "DELETE" }),
  activate: (id: string) => apiFetch<{ active: string }>(`/workspaces/${id}/activate`, { method: "POST" }),
}

export const clustersApi = {
  list: (workspaceId: string) =>
    apiFetch<{ clusters: ApiCluster[] }>(`/workspaces/${workspaceId}/clusters`).then((r) => r.clusters),
  create: (workspaceId: string, name: string, kubeconfig?: string) =>
    apiFetch<{ cluster: ApiCluster }>(`/workspaces/${workspaceId}/clusters`, { method: "POST", body: { name, kubeconfig } }).then((r) => r.cluster),
  remove: (workspaceId: string, clusterId: string) =>
    apiFetch<{ deleted: boolean }>(`/workspaces/${workspaceId}/clusters/${clusterId}`, { method: "DELETE" }),
}

// Scans come back from core-api already mapped to the frontend Scan shape
// (string enums) — see core-api lib/scan-json.ts. Typed unknown here; the
// scan-storage layer casts to the Scan type.
export const scansApi = {
  upload: (workspaceId: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return apiFetch<{ scan: unknown }>(`/workspaces/${workspaceId}/scans`, { method: "POST", form }).then((r) => r.scan)
  },
  list: (workspaceId: string, meta = false) =>
    apiFetch<{ scans: unknown[] }>(`/workspaces/${workspaceId}/scans${meta ? "?meta=1" : ""}`).then((r) => r.scans),
  get: (workspaceId: string, scanId: string) =>
    apiFetch<{ scan: unknown }>(`/workspaces/${workspaceId}/scans/${scanId}`).then((r) => r.scan),
  remove: (workspaceId: string, scanId: string) =>
    apiFetch<{ deleted: boolean }>(`/workspaces/${workspaceId}/scans/${scanId}`, { method: "DELETE" }),
}

export const subscriptionApi = {
  get: (workspaceId: string) =>
    apiFetch<{ subscription: { workspaceId: string; tier: string; status: string }; premium: boolean }>(`/billing/${workspaceId}/subscription`),
}

export const reportsApi = {
  list: (workspaceId: string) => apiFetch<{ reports: unknown[] }>(`/workspaces/${workspaceId}/reports`).then((r) => r.reports),
  generate: (workspaceId: string, body: { reportName: string; reportType: string; format: string; clusters: string[]; scanIds?: string[] }) =>
    apiFetch<{ reportId: string; status: string; fileSize: string }>(`/workspaces/${workspaceId}/reports`, { method: "POST", body }),
  remove: (workspaceId: string, reportId: string) =>
    apiFetch<{ deleted: boolean }>(`/workspaces/${workspaceId}/reports/${reportId}`, { method: "DELETE" }),
  download: (workspaceId: string, reportId: string) => apiDownload(`/workspaces/${workspaceId}/reports/${reportId}/download`),
}

export const scheduledReportsApi = {
  list: (workspaceId: string) =>
    apiFetch<{ scheduledReports: unknown[] }>(`/workspaces/${workspaceId}/scheduled-reports`).then((r) => r.scheduledReports),
  create: (workspaceId: string, body: Record<string, unknown>) =>
    apiFetch<{ scheduledReport: unknown }>(`/workspaces/${workspaceId}/scheduled-reports`, { method: "POST", body }).then((r) => r.scheduledReport),
  toggle: (workspaceId: string, id: string, enabled: boolean) =>
    apiFetch<{ scheduledReport: unknown }>(`/workspaces/${workspaceId}/scheduled-reports/${id}`, { method: "PATCH", body: { enabled } }).then((r) => r.scheduledReport),
  remove: (workspaceId: string, id: string) =>
    apiFetch<{ deleted: boolean }>(`/workspaces/${workspaceId}/scheduled-reports/${id}`, { method: "DELETE" }),
}

// core-api stores the active workspace server-side, but for instant UX the
// frontend also keeps a local pointer (active workspace + active scan). These
// are display/selection pointers only — all data is authorized server-side.
const ACTIVE_WS_KEY = "kubescope_active_workspace"
export function getLocalActiveWorkspace(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(ACTIVE_WS_KEY)
}
export function setLocalActiveWorkspace(id: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(ACTIVE_WS_KEY, id)
}
