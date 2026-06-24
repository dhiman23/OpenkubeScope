import jwt from "jsonwebtoken"

export interface AuthClaims {
  sub: string // user id
  email: string | null
  username: string | null
  // True until the bootstrap admin (or any forced account) changes credentials.
  mustChange: boolean
}

function secret(): string {
  const s = process.env.AUTH_JWT_SECRET
  if (!s) throw new Error("Missing AUTH_JWT_SECRET environment variable")
  return s
}

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, secret(), {
    expiresIn: (process.env.AUTH_JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"],
  })
}

export function verifyToken(token: string): AuthClaims {
  const decoded = jwt.verify(token, secret())
  if (typeof decoded === "string" || !decoded.sub) {
    throw new Error("Invalid token claims")
  }
  const d = decoded as Partial<AuthClaims> & { sub: string }
  return {
    sub: String(d.sub),
    email: d.email ?? null,
    username: d.username ?? null,
    mustChange: !!d.mustChange,
  }
}
