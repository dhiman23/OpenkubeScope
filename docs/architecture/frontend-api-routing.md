# Frontend → core-api routing

## Decision

The browser calls a **relative** path, `/api/...` (`services/web/lib/api-client.ts`), never an absolute URL. Routing ownership is split by layer, each layer knows only what it needs to:

- **Browser** — knows only `/api`. Never knows whether core-api is on `localhost`, a Kubernetes Service, or a real domain.
- **NGINX Ingress** (K8s) / **Next.js rewrite** (local dev, docker-compose) — decides which backend actually serves `/api`.
- **Kubernetes** — decides where core-api's pods currently live.

## Why not an absolute `NEXT_PUBLIC_CORE_API_URL`

`NEXT_PUBLIC_*` values are inlined into the JS bundle at `next build` time, not read at container start. An absolute URL there means:

- The value must exactly match wherever the frontend is deployed, or requests silently go to the wrong origin (the original bug this document exists because of: bundle baked with `localhost:8080`, deployed behind `openkubescope.local`, browser origin ≠ target origin → CORS/404).
- One image per environment (dev/staging/prod), since the URL is frozen at build time — breaks the 12-factor "build once, promote the same artifact" pattern that CI/CD should follow.

## Why there's no CORS in production

When frontend and backend sit behind the **same Ingress host**, `fetch("/api/...")` resolves against the page's own origin. Browser origin == request origin → same-origin request → no preflight, no `Access-Control-Allow-Origin` header needed, ever. This isn't CORS being "handled correctly" — CORS never enters the picture. The absolute-URL approach was manufacturing a cross-origin call that path-based Ingress routing was specifically designed to make unnecessary.

## Why Next.js rewrites exist, and only for local dev / docker-compose

`next.config.mjs` proxies `/api/:path*` to `CORE_API_PROXY_URL` (default `http://localhost:8080`). This only matters where nothing else sits in front of the Next server:

- **Bare `next dev`** — no Ingress, no reverse proxy. Rewrite sends `/api` to `localhost:8080`.
- **docker-compose** — no Ingress either; browser hits `web`'s Next server directly on `:3000`. Rewrite target becomes the compose service name, e.g. `CORE_API_PROXY_URL=http://coreapi:8080`.

**In Kubernetes, this rewrite never fires** — Ingress intercepts `/api` and routes it straight to `core-api-svc` before the request ever reaches the `web` pod. It's dead code in that path, kept only so the same image works unmodified in the two proxy-less local modes.

## Why Ingress owns routing in production

```
Browser
  │
openkubescope.com
  │
NGINX Ingress  ──┬── /api  → core-api-svc:8080
                 └── /     → web-svc:80
```

One host, one Ingress resource, two path rules. The frontend image is identical across dev/staging/prod; only the Ingress's host/TLS config differs per environment. `NEXT_PUBLIC_CORE_API_URL` remains available as an override for the rare case where core-api is deliberately served from a different origin than web — not needed under this architecture.

## Summary

| Environment | What proxies `/api` | Frontend build changes? |
|---|---|---|
| `next dev` | Next.js rewrite → `localhost:8080` | No |
| docker-compose | Next.js rewrite → `CORE_API_PROXY_URL` (compose service name) | No |
| Kubernetes (any env) | NGINX Ingress path rule → `core-api-svc` | No |

Same image, every environment. One less class of bug (bake-time URL mismatch) is now structurally impossible.
