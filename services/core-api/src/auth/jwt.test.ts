import { describe, it, expect, beforeAll } from "vitest"
import { signToken, verifyToken, type AuthClaims } from "./jwt"

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = "test-secret"
})

describe("signToken / verifyToken", () => {
  const claims: AuthClaims = {
    sub: "user-123",
    email: "a@b.com",
    username: "alice",
    mustChange: false,
  }

  it("round-trips claims through sign and verify", () => {
    const token = signToken(claims)
    const decoded = verifyToken(token)
    expect(decoded).toEqual(claims)
  })

  it("defaults missing optional claims to null/false on verify", () => {
    const token = signToken({ sub: "user-456", email: null, username: null, mustChange: false })
    const decoded = verifyToken(token)
    expect(decoded).toEqual({
      sub: "user-456",
      email: null,
      username: null,
      mustChange: false,
    })
  })

  it("throws on a malformed token", () => {
    expect(() => verifyToken("not-a-real-token")).toThrow()
  })

  it("throws when AUTH_JWT_SECRET is missing", () => {
    const original = process.env.AUTH_JWT_SECRET
    delete process.env.AUTH_JWT_SECRET
    expect(() => signToken(claims)).toThrow("Missing AUTH_JWT_SECRET environment variable")
    process.env.AUTH_JWT_SECRET = original
  })
})
