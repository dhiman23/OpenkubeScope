# report-service

gRPC service that builds RBAC audit reports (JSON / CSV / PDF), owns the
`report.reports` and `report.scheduled_reports` tables in RDS Postgres, and
runs scheduled reports. Ported from `lib/report-generator.ts`,
`lib/report-pdf.ts`, `lib/scheduled-reports.ts`, `lib/report-storage.ts`, and
`lib/notifications.ts` in the monolith (which used Supabase). Talks to Postgres
directly via `pg`.

## Runtime

- Node.js >= 20 (LTS), TypeScript 5
- Protocol: gRPC (`@grpc/grpc-js`), generated from [`proto/report.proto`](../../proto/report.proto) **and** [`proto/scanner.proto`](../../proto/scanner.proto) via `ts-proto`. This service is a gRPC **server** for report.proto and a gRPC **client** of scanner.proto.
- Requires `protoc` on PATH at build/dev time for codegen.
- Database: AWS RDS Postgres, raw SQL via `pg`. Owns the `report` schema only — see [`migrations/0001_create_reports.sql`](migrations/0001_create_reports.sql). `workspace_id` and `scan_ids` are plain UUID columns, no cross-schema FKs.
- PDF rendering: `jspdf` + `jspdf-autotable`, run server-side (no browser).

## Trigger mechanism (locked decision)

Report generation is a **synchronous gRPC call** (`GenerateReport`) from core-api
→ report-service — matching the monolith's inline `generateReport()` behavior.
This was the open Phase 2 decision; sync gRPC was chosen over Redis pub/sub for
simplicity and because report generation is fast and request-scoped.

Redis is still used, per the locked architecture decision, for **caching scan
data** fetched from rbac-scanner-service (`ListScansByCluster` results), keyed
per workspace+clusters. Caching degrades gracefully to no-op if `REDIS_URL` is
unset or Redis is unreachable.

## Inter-service dependency

Calls `rbac-scanner-service`'s `ListScansByCluster` (gRPC) to get scan data —
it never reads the `scanner` schema directly. Set `SCANNER_SERVICE_ADDR` to the
scanner's gRPC address.

## Port

- `PORT` (default `50052`) — gRPC listener, plaintext. TLS/mTLS is DevOps scope.

## Environment variables

| Var | Required | Description |
|---|---|---|
| `PORT` | no (default `50052`) | gRPC bind port |
| `DATABASE_URL` | yes | RDS Postgres connection string |
| `DATABASE_SSL` | no (default `true`) | `false` for local Postgres without TLS |
| `DATABASE_POOL_MAX` | no (default `10`) | Max `pg` pool connections |
| `SCANNER_SERVICE_ADDR` | yes | gRPC address of rbac-scanner-service (e.g. `rbac-scanner-service:50051`) |
| `REDIS_URL` | no | Redis for scan-data caching; caching disabled if unset |
| `SCAN_CACHE_TTL_SECONDS` | no (default `300`) | TTL for cached scan fetches |
| `PUBLIC_SITE_URL` | no | Used in Slack notification deep-links back to the app |

See [`.env.example`](.env.example).

## Migrations

[`migrations/0001_create_reports.sql`](migrations/0001_create_reports.sql)
creates the `report` schema with `reports` + `scheduled_reports`. Run it against
the shared RDS instance before starting (`psql $DATABASE_URL -f migrations/0001_create_reports.sql`).

## Health check

Standard gRPC Health Checking Protocol (`grpc.health.v1.Health`) via
`grpc-health-check`, registered for `kubescope.report.v1.ReportService`.

## Build / run

```bash
npm install
npm run dev      # codegen + ts-node
npm run build     # codegen + tsc -> dist/
npm start          # node dist/server.js
npm run typecheck
```

## RPCs (see proto/report.proto for the full contract)

- `GenerateReport` — fetch scans (via scanner gRPC), build report, render JSON/CSV/PDF bytes, persist, return. Returns `file_content` bytes (the downloadable file); the structured `report_data` proto field is intentionally not populated (the rendered file carries the data — for JSON the bytes *are* the data).
- `GetReport` / `ListReports` / `DeleteReport` — report CRUD, scoped to workspace_id
- `ListScheduledReports` / `CreateScheduledReport` / `DeleteScheduledReport` / `ToggleScheduledReport` — scheduled-report CRUD
- `RunDueScheduledReports` — runs every due+enabled schedule (claimed with `FOR UPDATE SKIP LOCKED` so concurrent cron calls don't double-run), generates each report, fires Slack notifications. Invoked by core-api's cron endpoint.

## Notable hardening (carried from the codebase audit)

- Slack webhook URLs are validated to be `https://hooks.slack.com` before any request — closes the SSRF/data-exfil vector where an attacker-controlled `slack_webhook_url` would receive full report contents.
- All queries are parameterized and scoped by `workspace_id`.

## Explicitly out of scope for this service

- Auth / workspace-ownership verification — core-api's job before calling in.
- S3/object storage for report files — currently stored inline (base64) in Postgres; swapping to S3 is a DevOps/infra decision (the column would hold an object key).
- Dockerfile, Helm, Terraform, CI, Prometheus/Grafana, secrets, ingress, HPA — DevOps scope per the project split.
