# Build context is the repo root (not this directory) — this service's
# codegen reads proto/scanner.proto via ../../proto (see scripts/gen-proto.sh),
# so proto/ must be present in the build context.
# Build from repo root:
#   docker build -f services/rbac-scanner-service/Dockerfile -t rbac-scanner-service .

FROM node:20-slim AS builder

# protoc is only needed to generate src/generated/scanner.ts at build time.
RUN apt-get update && apt-get install -y --no-install-recommends protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY proto ./proto
COPY services/rbac-scanner-service/package.json services/rbac-scanner-service/package-lock.json ./services/rbac-scanner-service/
WORKDIR /repo/services/rbac-scanner-service
RUN npm ci

COPY services/rbac-scanner-service/. .
RUN npm run build \
    && npm prune --production

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /repo/services/rbac-scanner-service/dist ./dist
COPY --from=builder /repo/services/rbac-scanner-service/node_modules ./node_modules
COPY --from=builder /repo/services/rbac-scanner-service/package.json ./

# Official node images ship a non-root "node" user (uid 1000).
USER node

EXPOSE 50051
CMD ["node", "dist/server.js"]
