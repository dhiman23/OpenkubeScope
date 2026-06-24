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

  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload })

  if (res.status === 204) return undefined as T

  const isJson = res.headers.get("content-type")?.includes("application/json")
  const data = isJson ? await res.json().catch(() => ({})) : await res.text()

  if (!res.ok) {
    const message = (isJson && (data as { error?: string }).error) || res.statusText
    const code = isJson ? (data as { code?: string }).code : undefined
    throw new ApiError(res.status, message, code)
  }

  return data as T
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
