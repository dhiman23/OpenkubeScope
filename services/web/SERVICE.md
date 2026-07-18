# web

Next.js frontend. REST-only client of `core-api` — no direct database or gRPC
access. See `lib/api-client.ts` for the base URL wiring.

## Runtime

- Node.js >= 20 (LTS), Next.js (App Router)
- Package manager: pnpm

## Port

- `3000` (Next.js default; `next start` respects `PORT` if set)

## Environment variables

| Var | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_CORE_API_URL` | no (default `http://localhost:8080/api`) | Base URL of core-api's REST API |

**`NEXT_PUBLIC_*` vars are inlined into the JS bundle at `next build` time**,
not read at container start — the value must be correct *when the image is
built*, not just set at `docker run`/pod-start time. If core-api's URL differs
per environment (dev/staging/prod), either build one image per environment
with the right build arg, or switch this to a server-side-fetched config if
that becomes a problem.

## Build / run

```bash
pnpm install
pnpm dev      # local dev server
pnpm build     # production build -> .next/
pnpm start      # serve the production build
```

## Container build & run

No `Dockerfile` here yet. Unlike the three gRPC services, this one does not
depend on `proto/` — build context can be just this directory, or the repo
root if you prefer one consistent convention across services.

```bash
# from this directory
docker build --build-arg NEXT_PUBLIC_CORE_API_URL=https://api.kubescope.example/api -t web .
```

- Pass `NEXT_PUBLIC_CORE_API_URL` as a `--build-arg` (and `ARG`/`ENV` it in the
  Dockerfile before `pnpm build`) — setting it only as a runtime `ENV`/K8s env
  var will not work, per the note above.
- Exposes HTTP port `3000`.
- Consider Next.js `output: "standalone"` in `next.config.mjs` to keep the
  runtime image small (copies only the traced production dependencies instead
  of full `node_modules`).
- No health check endpoint of its own yet — a plain `GET /` 200 is sufficient
  for a liveness probe.

## Explicitly out of scope for this service

- Dockerfile, Helm, Terraform, CI, ingress, HPA — DevOps scope per the project split.
