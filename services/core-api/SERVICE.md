# core-api

The BFF (backend-for-frontend). REST/HTTP-facing for the Next.js frontend;
calls `rbac-scanner-service` and `report-service` internally over gRPC. Owns
auth, workspaces, clusters, billing, and scan-quota enforcement. Replaces the
monolith's Supabase Auth (now `core.users` + JWT) and the API routes under
`app/api/*`.

## Runtime

- Node.js >= 20 (LTS), TypeScript 5
- HTTP framework: Express 5
- Database: AWS RDS Postgres via `pg`, owns the `core` schema — see [`migrations/0001_create_core.sql`](migrations/0001_create_core.sql)
- gRPC **client** of both internal services; stubs generated from [`proto/scanner.proto`](../../proto/scanner.proto) + [`proto/report.proto`](../../proto/report.proto) via `ts-proto` (needs `protoc` at build time)
- Auth: HMAC-signed JWTs (`jsonwebtoken`), passwords hashed with `bcryptjs`
- Billing: Stripe (`stripe`)

## Port

- `PORT` (default `8080`) — HTTP listener. This is the only service browsers talk to. TLS termination / ALB / ingress is DevOps scope.

## Environment variables

| Var | Required | Description |
|---|---|---|
| `PORT` | no (default `8080`) | HTTP bind port |
| `DATABASE_URL` | yes | RDS Postgres connection string |
| `DATABASE_SSL` | no (default `true`) | `false` for local Postgres without TLS |
| `DATABASE_POOL_MAX` | no (default `10`) | Max `pg` pool connections |
| `AUTH_JWT_SECRET` | yes | HMAC secret for signing/verifying JWTs |
| `AUTH_JWT_EXPIRES_IN` | no (default `7d`) | JWT lifetime |
| `SCANNER_SERVICE_ADDR` | yes | gRPC address of rbac-scanner-service |
| `REPORT_SERVICE_ADDR` | yes | gRPC address of report-service |
| `STRIPE_SECRET_KEY` | for billing | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | for billing | Stripe webhook signing secret |
| `STRIPE_PRICE_ID_UNLIMITED` | for billing | Price ID for the Unlimited plan |
| `CRON_SECRET` | for cron | Bearer token gating `POST /api/cron/scheduled-reports` |
| `PUBLIC_SITE_URL` | no | Frontend base URL (Stripe redirects) |
| `CORS_ORIGINS` | no (default `http://localhost:3000`) | Comma-separated allowed origins |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | OTLP collector URL; tracing off if unset |
| `OTEL_SERVICE_NAME` | no (default `core-api`) | OTel service name |

See [`.env.example`](.env.example).

## Migrations

[`migrations/0001_create_core.sql`](migrations/0001_create_core.sql) creates the
`core` schema: `users`, `workspaces`, `clusters`, `user_settings`,
`subscriptions`, `scan_usage`.
[`migrations/0002_admin_bootstrap.sql`](migrations/0002_admin_bootstrap.sql) adds
username login + the forced-change flag. Run both before starting.

## Bootstrap admin (Jenkins-style)

On first boot, if there are no users, core-api seeds an admin account
(`ensureBootstrapAdmin`): **username `admin`, password `admin`**, flagged
`must_change_credentials`. Login returns `mustChange: true`; every protected
route returns `403 MUST_CHANGE_CREDENTIALS` until the user calls
`POST /auth/change-credentials` with a new username + password (defaults are
rejected). A fresh token with `mustChange: false` is issued on success.
Self-service email/password signup still exists alongside this.

## Health check

`GET /healthz` → `{ "status": "ok" }`. (Plain HTTP since core-api is the REST
tier; the gRPC services use the gRPC health protocol.) Wiring into K8s probes /
ALB target groups is DevOps scope.

## REST API surface

All under `/api`. All except `/auth/*` and the Stripe webhook require
`Authorization: Bearer <jwt>`.

- `POST /auth/signup` (email/password), `POST /auth/login` (by `username` or `email`) → `{ token, user, mustChange }`
- `POST /auth/change-credentials` (auth) → set new username + password, returns a fresh token. The only action allowed while `mustChange` is true.
- `GET/POST /workspaces`, `PATCH/DELETE /workspaces/:id`, `POST /workspaces/:id/activate`
- `GET/POST /workspaces/:id/clusters`, `DELETE /workspaces/:id/clusters/:clusterId`
- `POST /workspaces/:id/scans` (multipart `file`) — quota-checked, calls scanner
- `GET /workspaces/:id/scans` (`?meta=1`), `GET/DELETE /workspaces/:id/scans/:scanId`
- `POST /workspaces/:id/reports`, `GET /workspaces/:id/reports`, `GET /workspaces/:id/reports/:reportId/download`, `DELETE …`
- `GET/POST /workspaces/:id/scheduled-reports`, `PATCH/DELETE …/:id`
- `GET /billing/:id/subscription`, `POST /billing/:id/checkout`, `POST /billing/:id/portal`
- `POST /api/stripe/webhook` (raw body, signature-verified; no auth)
- `POST /api/cron/scheduled-reports` (bearer `CRON_SECRET`)

## Trust boundary

core-api is where authn/authz happens. Every route resolves `req.user` from the
JWT and verifies the user owns the target workspace (`getOwnedWorkspace`) before
making any gRPC call. The internal services have no user session — they trust
the `workspace_id` core-api sends. Keep scanner/report on the internal network;
do not expose their gRPC ports publicly (DevOps: network policy / security
groups).

## Notable hardening (from the codebase audit)

- Free-tier scan limit is enforced with an **atomic** conditional increment (`core.scan_usage`), replacing the monolith's count-then-insert TOCTOU race.
- `CRON_SECRET` is compared in **constant time** (`crypto.timingSafeEqual`), not `===`.
- Login returns the same error whether the email is unknown or the password is wrong (no account enumeration).
- Stripe webhook signature is verified against the raw request body before any processing.
- `deleteCluster` / scan deletes filter by `workspace_id` in the query (no reliance on RLS, which doesn't exist at this layer).

## Build / run

```bash
npm install
npm run dev      # codegen + ts-node
npm run build     # codegen + tsc -> dist/
npm start          # node dist/server.js
npm run typecheck
```

## Explicitly out of scope for this service

- Dockerfile, Helm, Terraform, ArgoCD, GitHub Actions, Prometheus/Grafana config, secrets management, Ingress/ALB, HPA — DevOps scope per the project split. core-api wires the OTel SDK; the collector/Grafana side is DevOps.
- The existing Next.js app under `app/` is left in place — actually pointing the frontend at core-api (replacing the in-app Supabase/`app/api` calls) is the remaining integration step beyond Phase 3's backend scope.
