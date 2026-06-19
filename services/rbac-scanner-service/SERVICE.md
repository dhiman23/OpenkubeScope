# rbac-scanner-service

gRPC service that parses Kubernetes RBAC snapshots (JSON or ZIP), runs the
12-rule findings engine, and owns the `scanner.scans` table in RDS Postgres.
Ported from `lib/rbac-scanner.ts` + `lib/scan-storage.ts` in the monolith
(which used Supabase) — this service talks to Postgres directly via `pg`,
no Supabase SDK.

## Runtime

- Node.js >= 20 (LTS), TypeScript 5
- Protocol: gRPC (`@grpc/grpc-js`), generated from [`proto/scanner.proto`](../../proto/scanner.proto) via `ts-proto`
- Requires `protoc` on PATH at build/dev time for codegen (e.g. `brew install protobuf`)
- Database: AWS RDS Postgres, raw SQL via `pg` (`node-postgres`). This service owns the `scanner` schema only — see [`migrations/0001_create_scans.sql`](migrations/0001_create_scans.sql). `workspace_id` is a plain UUID column, not a foreign key into core-api's `workspaces` table — schemas are isolated, no cross-schema FKs. core-api must verify workspace ownership before calling this service.

## Port

- `PORT` (default `50051`) — gRPC listener, plaintext (`grpc.ServerCredentials.createInsecure()`).
  TLS termination, mTLS between services, and network policy are DevOps/infra scope, not this service's.

## Environment variables

| Var | Required | Description |
|---|---|---|
| `PORT` | no (default `50051`) | gRPC bind port |
| `DATABASE_URL` | yes | RDS Postgres connection string |
| `DATABASE_SSL` | no (default `true`) | Set `false` for local/dev Postgres without TLS |
| `DATABASE_POOL_MAX` | no (default `10`) | Max connections in the `pg` pool |

This service has no end-user session — it trusts `workspace_id` passed by the
caller (core-api), which must verify ownership before calling in. There's no
RLS at this layer (raw Postgres access), so every query filters by
`workspace_id` explicitly in application code — see `scan-repository.ts`.

See [`.env.example`](.env.example).

## Migrations

[`migrations/0001_create_scans.sql`](migrations/0001_create_scans.sql) creates
the `scanner` schema and `scanner.scans` table. Run it against the shared RDS
instance before starting the service (e.g. `psql $DATABASE_URL -f migrations/0001_create_scans.sql`).
No migration framework wired up yet — plain numbered SQL files for now.

## Health check

Implements the standard gRPC Health Checking Protocol (`grpc.health.v1.Health`)
via `grpc-health-check`, registered for service name
`kubescope.scanner.v1.RbacScannerService`. Use any standard gRPC health-check
probe (e.g. `grpc-health-probe -addr=:50051`) for liveness/readiness — wiring
that into Kubernetes probes is DevOps scope.

## Build / run

```bash
npm install
npm run dev      # codegen + ts-node, for local development
npm run build     # codegen + tsc -> dist/
npm start          # node dist/server.js
npm run typecheck
```

`npm run gen:proto` regenerates `src/generated/scanner.ts` from
`proto/scanner.proto` — re-run it whenever the proto changes.

## RPCs (see proto/scanner.proto for full contract)

- `ScanSnapshot` — parse + persist a snapshot, run findings engine, return the `Scan`
- `GetScan` — fetch one scan by id, scoped to workspace_id
- `ListScansByCluster` — latest scan per cluster name, scoped to workspace_id (used by report-service instead of querying `scans` directly)
- `DeleteScan` — delete one scan, scoped to workspace_id (both workspace_id and scan_id are filtered in the query)

## Explicitly out of scope for this service

- Free-tier scan-limit / quota enforcement — that's billing logic and stays in core-api (it owns subscriptions). core-api must check quota before calling `ScanSnapshot`.
- Auth — no end-user session reaches this service; trust boundary is core-api.
- Dockerfile, Helm, Terraform, CI, Prometheus/Grafana, secrets management, ingress, HPA — DevOps scope per the project split.
