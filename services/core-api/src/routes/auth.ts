import { Router } from "express"
import { createUser, findUserByEmail, verifyPassword } from "../repositories/users"
import { signToken } from "../auth/jwt"

export const authRouter = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
    const token = signToken({ sub: user.id, email: user.email })
    return res.status(201).json({ token, user })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Signup failed" })
  }
})

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {}
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password required" })
    }

    const user = await findUserByEmail(email)
    // Same response whether the user exists or the password is wrong — avoids
    // leaking which emails are registered.
    if (!user || !(await verifyPassword(user, password))) {
      return res.status(401).json({ error: "Invalid email or password" })
    }

    const token = signToken({ sub: user.id, email: user.email })
    return res.json({ token, user: { id: user.id, email: user.email } })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Login failed" })
  }
})
