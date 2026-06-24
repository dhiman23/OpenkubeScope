"use client"

import React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { authApi, getToken, setToken, clearToken, type AuthUser } from "@/lib/api-client"

// Decode the (unverified) JWT payload client-side just to read claims like
// mustChange / username for UI state. The token is still verified server-side
// on every request — this is display-only.
function decodeClaims(token: string): { sub: string; username: string | null; email: string | null; mustChange: boolean } | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return {
      sub: String(payload.sub),
      username: payload.username ?? null,
      email: payload.email ?? null,
      mustChange: !!payload.mustChange,
    }
  } catch {
    return null
  }
}

interface AuthContextType {
  user: AuthUser | null
  mustChange: boolean
  loading: boolean
  login: (identifier: string, password: string) => Promise<{ mustChange: boolean }>
  signup: (email: string, password: string) => Promise<void>
  changeCredentials: (currentPassword: string, newUsername: string, newPassword: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  mustChange: false,
  loading: true,
  login: async () => ({ mustChange: false }),
  signup: async () => {},
  changeCredentials: async () => {},
  signOut: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [mustChange, setMustChange] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Rehydrate session from a stored token on first load.
  useEffect(() => {
    const token = getToken()
    if (token) {
      const claims = decodeClaims(token)
      if (claims) {
        setUser({ id: claims.sub, username: claims.username, email: claims.email })
        setMustChange(claims.mustChange)
      } else {
        clearToken()
      }
    }
    setLoading(false)
  }, [])

  const applyResult = useCallback((result: { token: string; user: AuthUser; mustChange: boolean }) => {
    setToken(result.token)
    setUser(result.user)
    setMustChange(result.mustChange)
  }, [])

  const login = useCallback(
    async (identifier: string, password: string) => {
      const result = await authApi.login(identifier, password)
      applyResult(result)
      return { mustChange: result.mustChange }
    },
    [applyResult],
  )

  const signup = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.signup(email, password)
      applyResult(result)
    },
    [applyResult],
  )

  const changeCredentials = useCallback(
    async (currentPassword: string, newUsername: string, newPassword: string) => {
      const result = await authApi.changeCredentials(currentPassword, newUsername, newPassword)
      applyResult(result)
    },
    [applyResult],
  )

  const signOut = useCallback(() => {
    clearToken()
    setUser(null)
    setMustChange(false)
    router.push("/auth/login")
  }, [router])

  const value = useMemo(
    () => ({ user, mustChange, loading, login, signup, changeCredentials, signOut }),
    [user, mustChange, loading, login, signup, changeCredentials, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
