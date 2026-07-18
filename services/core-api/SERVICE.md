# core-api

The BFF (backend-for-frontend). REST/HTTP-facing for the Next.js frontend;
calls `rbac-scanner-service` and `report-service` internally over gRPC. Owns
auth, workspaces, clusters, and scan-quota enforcement. Replaces the
monolith's Supabase Auth (now `core.users` + JWT) and the API routes under
`app/api/*`. No Stripe / payment provider — tier is set internally.

## Runtime

- Node.js >= 20 (LTS), TypeScript 5
- HTTP framework: Express 5
- Database: AWS RDS Postgres via `pg`, owns the `core` schema — see [`migrations/0001_create_core.sql`](migrations/0001_create_core.sql)
- gRPC **client** of both internal services; stubs generated from [`proto/scanner.proto`](../../proto/scanner.proto) + [`proto/report.proto`](../../proto/report.proto) via `ts-proto` (needs `protoc` at build time)
- Auth: HMAC-signed JWTs (`jsonwebtoken`), passwords hashed with `bcryptjs`

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
| `CRON_SECRET` | for cron | Bearer token gating `POST /api/cron/scheduled-reports` |
| `SCAN_SQS_QUEUE_URL` | no | `rbac_scan_queue` URL. If set, `POST /scans` goes async (SQS); if unset, sync gRPC fallback |
| `AWS_REGION` | when SQS on | Region for the SQS client (IRSA provides credentials) |
| `PUBLIC_SITE_URL` | no | Frontend base URL |
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

All under `/api`. All except `/auth/*` require `Authorization: Bearer <jwt>`.

- `POST /auth/signup` (email/password), `POST /auth/login` (by `username` or `email`) → `{ token, user, mustChange }`
- `POST /auth/change-credentials` (auth) → set new username + password, returns a fresh token. The only action allowed while `mustChange` is true.
- `GET/POST /workspaces`, `PATCH/DELETE /workspaces/:id`, `POST /workspaces/:id/activate`
- `GET/POST /workspaces/:id/clusters`, `DELETE /workspaces/:id/clusters/:clusterId`
- `POST /workspaces/:id/scans` (multipart `file`) — quota-checked. **Async when `SCAN_SQS_QUEUE_URL` is set** (the event-driven flow): persists the snapshot via the `SubmitScan` RPC, publishes `{scanId, workspaceId}` to `rbac_scan_queue`, returns `202 { scan: { id, status: "pending", fileName } }`; the frontend polls `GET /scans/:scanId` until the status flips. Without SQS: synchronous `ScanSnapshot` RPC, returns `201` with the full scan. If the enqueue fails after the row was created, the orphan row is deleted and the quota slot refunded (best-effort), `502` returned. A scan that fails **after** queueing keeps its quota slot — deleting the failed scan refunds it.
- `GET /workspaces/:id/scans` (`?meta=1`), `GET/DELETE /workspaces/:id/scans/:scanId`
- `POST /workspaces/:id/reports` — **async when `SQS_QUEUE_URL` is set**: creates the row via the `CreateReport` RPC, enqueues the job on SQS, returns `202 { reportId, status: "generating" }` (frontend polls the list). Without SQS: synchronous `GenerateReport` RPC, returns `201 { reportId, status: "completed", fileSize }`. If the enqueue fails after the row was created, the row is deleted (best-effort) and `502` is returned.
- `GET /workspaces/:id/reports`, `GET /workspaces/:id/reports/:reportId/download`, `DELETE …`
- `GET/POST /workspaces/:id/scheduled-reports`, `PATCH/DELETE …/:id`
- `POST /api/cron/scheduled-reports` (bearer `CRON_SECRET`)

## AWS / IAM (DevOps scope — what this service needs)

As the SQS **producer** in the event-driven scan flow (core-api →
`rbac_scan_queue` → rbac-scanner-service), core-api's pod service account
needs an IRSA role with only `sqs:SendMessage` on the queue. Note:
`infra/keda.tf` currently defines roles only for the KEDA operator
(GetQueueAttributes/GetQueueUrl) and the consumer — the producer policy is
deferred/not created yet. `AWS_REGION` must be set in the pod env.

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
- `deleteCluster` / scan deletes filter by `workspace_id` in the query (no reliance on RLS, which doesn't exist at this layer).

## Build / run

```bash
npm install
npm run dev      # codegen + ts-node
npm run build     # codegen + tsc -> dist/
npm start          # node dist/server.js
npm run typecheck
```

## Container build & run

No `Dockerfile` here yet — follow the same pattern as
`services/rbac-scanner-service/Dockerfile` (multi-stage: builder installs
`protoc` + runs `npm run build`; runtime stage copies `dist/` + production
`node_modules`, non-root user).

**Build context must be the repo root, not this directory** — `scripts/gen-proto.sh`
reads both `proto/scanner.proto` and `proto/report.proto` via `../../proto`
(core-api is a gRPC client of both internal services), so both files must be
in the build context:

```bash
# from the repo root
docker build -f services/core-api/Dockerfile -t core-api .
```

- Exposes HTTP port `8080` — the only service that should be reachable from
  outside the cluster (browser-facing).
- Runtime env required: `DATABASE_URL`, `AUTH_JWT_SECRET`, `SCANNER_SERVICE_ADDR`,
  `REPORT_SERVICE_ADDR`, `CRON_SECRET` (for the cron endpoint), `CORS_ORIGINS`.
  For the async scan flow, `SCAN_SQS_QUEUE_URL` + `AWS_REGION` (omit both to
  fall back to the synchronous `ScanSnapshot` RPC — no AWS needed locally).
  Full list above under Environment variables.
- No AWS credentials baked into the image — IRSA (SendMessage-only role)
  injects them at runtime in-cluster.
- Health check: `GET /healthz` → `{ "status": "ok" }` (plain HTTP, not gRPC).

## Explicitly out of scope for this service

- Dockerfile, Helm, Terraform, ArgoCD, GitHub Actions, Prometheus/Grafana config, secrets management, Ingress/ALB, HPA — DevOps scope per the project split. core-api wires the OTel SDK; the collector/Grafana side is DevOps.
- The existing Next.js app under `app/` is left in place — actually pointing the frontend at core-api (replacing the in-app Supabase/`app/api` calls) is the remaining integration step beyond Phase 3's backend scope.
