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

## Event-driven scan flow (SQS + KEDA)

This service is the **consumer** in the project's event-driven milestone:

```
User -> core-api -> rbac_scan_queue (SQS) -> rbac-scanner-service -> Postgres
```

1. core-api calls `SubmitScan` (fast RPC) — the raw snapshot bytes and a
   `pending` scan row are persisted in the `scanner` schema. Raw bytes stay in
   the DB because SQS caps messages at 256KB while snapshots can be 32MB.
2. core-api publishes `{version: 1, scanId, workspaceId}` to `rbac_scan_queue`.
3. The SQS consumer here (`src/lib/sqs-consumer.ts`) long-polls the queue
   (1 message at a time, `WaitTimeSeconds=20`), loads the raw snapshot, runs
   the findings engine, and moves the row to `completed` (or `failed`), then
   deletes the message — **only after** the row reaches a terminal state.
4. KEDA watches queue depth and scales this Deployment. The consumer runs in
   the same process as the gRPC server, so the ScaledObject needs
   `minReplicaCount: 1` — GetScan/ListScans must stay reachable.

Failure semantics: parse/engine errors mark the row `failed` (terminal — the
message is deleted, no retry loop for bad input). Infrastructure errors (DB
down, etc.) leave the message on the queue; it reappears after the visibility
timeout and, after `maxReceiveCount` attempts, lands in `rbac_scan_dlq`.
A status guard makes redelivered jobs no-ops once the row is terminal.
`terminationGracePeriodSeconds` should cover one scan plus the 20s long-poll.

**Sync fallback:** if `SCAN_SQS_QUEUE_URL` is unset the consumer never starts
and core-api uses the synchronous `ScanSnapshot` RPC — local dev needs no AWS.

### AWS / IAM (DevOps scope — what this service needs)

- Runs as service account `consumer` (namespace `consumer` per the IRSA trust
  policy in `infra/keda.tf`). Credentials come from the default AWS SDK
  provider chain — no static keys in env.
- Queue permissions: `sqs:ReceiveMessage`, `sqs:DeleteMessage`,
  `sqs:ChangeMessageVisibility`, `sqs:GetQueueAttributes`, `sqs:GetQueueUrl`
  (already in `consumer_irsa_policy`).
- `AWS_REGION` must be set in the pod env.

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
| `SCAN_SQS_QUEUE_URL` | no | `rbac_scan_queue` URL; SQS consumer disabled if unset (sync fallback) |
| `AWS_REGION` | when SQS on | Region for the SQS client (IRSA provides credentials) |

This service has no end-user session — it trusts `workspace_id` passed by the
caller (core-api), which must verify ownership before calling in. There's no
RLS at this layer (raw Postgres access), so every query filters by
`workspace_id` explicitly in application code — see `scan-repository.ts`.

See [`.env.example`](.env.example).

## Migrations

[`migrations/0001_create_scans.sql`](migrations/0001_create_scans.sql) creates
the `scanner` schema and `scanner.scans` table.
[`migrations/0002_async_scan_status.sql`](migrations/0002_async_scan_status.sql)
adds `status` / `raw_snapshot` / `error_message` for the async (SQS) flow —
existing rows default to `completed`, no backfill needed. Run both against the
shared RDS instance before starting the service (e.g. `psql $DATABASE_URL -f migrations/0001_create_scans.sql`).
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

- `ScanSnapshot` — parse + persist a snapshot, run findings engine, return the `Scan` (synchronous fallback path)
- `SubmitScan` — persist raw snapshot + `pending` row, return `scan_id`; no engine work (async SQS intake)
- `GetScan` — fetch one scan by id, scoped to workspace_id (pending/failed rows carry `status` + `error_message`)
- `ListScansByCluster` — latest **completed** scan per cluster name, scoped to workspace_id (used by report-service instead of querying `scans` directly; pending/failed rows are excluded so reports never build from half-done scans)
- `DeleteScan` — delete one scan, scoped to workspace_id (both workspace_id and scan_id are filtered in the query)

## Explicitly out of scope for this service

- Free-tier scan-limit / quota enforcement — that's billing logic and stays in core-api (it owns subscriptions). core-api must check quota before calling `ScanSnapshot`.
- Auth — no end-user session reaches this service; trust boundary is core-api.
- Dockerfile, Helm, Terraform, CI, Prometheus/Grafana, secrets management, ingress, HPA — DevOps scope per the project split.
