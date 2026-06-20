import type { Request, Response, NextFunction } from "express"
import { verifyToken } from "./jwt"

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string }
    }
  }
}

// Requires a valid Bearer JWT. Attaches req.user. This is the trust boundary:
// downstream gRPC services trust the workspace_id core-api sends after the
// ownership checks in the route handlers.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" })
    return
  }

  try {
    const claims = verifyToken(header.slice("Bearer ".length))
    req.user = { id: claims.sub, email: claims.email }
    next()
  } catch {
    res.status(401).json({ error: "Invalid or expired token" })
  }
}
