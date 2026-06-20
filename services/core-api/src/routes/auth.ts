import { Router } from "express"
import {
  createUser,
  findUserByEmail,
  findUserByIdentifier,
  verifyPassword,
  isUsernameTaken,
  updateCredentials,
  BOOTSTRAP_ADMIN_USERNAME,
} from "../repositories/users"
import { signToken } from "../auth/jwt"
import { requireAuth } from "../auth/middleware"

export const authRouter = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/

// Self-service email/password signup (kept alongside the Jenkins-style admin).
authRouter.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body ?? {}
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Valid email required" })
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" })
    }

    const existing = await findUserByEmail(email)
    if (existing) return res.status(409).json({ error: "Email already registered" })

    const user = await createUser(email, password)
    const token = signToken({ sub: user.id, email: user.email, username: user.username, mustChange: false })
    return res.status(201).json({ token, user, mustChange: false })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Signup failed" })
  }
})

// Login by username OR email. Bootstrap admin logs in with admin / admin and
// receives mustChange = true, signalling the frontend to show the
// change-credentials form. The same flag gates every other API route.
authRouter.post("/login", async (req, res) => {
  try {
    const body = req.body ?? {}
    const identifier: unknown = body.username ?? body.email ?? body.identifier
    const { password } = body
    if (typeof identifier !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "username (or email) and password required" })
    }

    const user = await findUserByIdentifier(identifier)
    // Same response for unknown account vs wrong password — no enumeration.
    if (!user || !(await verifyPassword(user, password))) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const token = signToken({ sub: user.id, email: user.email, username: user.username, mustChange: user.must_change_credentials })
    return res.json({
      token,
      user: { id: user.id, email: user.email, username: user.username },
      mustChange: user.must_change_credentials,
    })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Login failed" })
  }
})

// Forced (or voluntary) credential change. Requires auth but NOT
// requireCredentialsChanged — this is the one action a must-change user can do.
// Re-verifies the current password, then sets a new username + password and
// issues a fresh token with mustChange = false.
authRouter.post("/change-credentials", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newUsername, newPassword } = req.body ?? {}
    if (typeof currentPassword !== "string" || typeof newUsername !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ error: "currentPassword, newUsername and newPassword required" })
    }
    if (!USERNAME_RE.test(newUsername)) {
      return res.status(400).json({ error: "Username must be 3-32 chars (letters, digits, . _ -)" })
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" })
    }
    if (newUsername.toLowerCase() === BOOTSTRAP_ADMIN_USERNAME && newPassword === "admin") {
      return res.status(400).json({ error: "Choose a username and password different from the defaults" })
    }

    const user = await findUserByIdentifier(req.user!.username || req.user!.email || "")
    if (!user || !(await verifyPassword(user, currentPassword))) {
      return res.status(401).json({ error: "Current password is incorrect" })
    }

    if (await isUsernameTaken(newUsername, user.id)) {
      return res.status(409).json({ error: "Username already taken" })
    }

    await updateCredentials(user.id, newUsername, newPassword)
    const token = signToken({ sub: user.id, email: user.email, username: newUsername, mustChange: false })
    return res.json({ token, user: { id: user.id, email: user.email, username: newUsername }, mustChange: false })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Credential change failed" })
  }
})
