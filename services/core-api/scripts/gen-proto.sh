#!/usr/bin/env bash
# core-api is a gRPC *client* of both rbac-scanner-service and report-service,
# so it generates client stubs + types from both proto files. Requires `protoc`.
set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# core-api owns no proto — each contract is read from its owning service.
SCANNER_PROTO_DIR="$SERVICE_DIR/../rbac-scanner-service/proto"
REPORT_PROTO_DIR="$SERVICE_DIR/../report-service/proto"
OUT_DIR="$SERVICE_DIR/src/generated"

mkdir -p "$OUT_DIR"

protoc \
  --plugin=protoc-gen-ts_proto="$SERVICE_DIR/node_modules/.bin/protoc-gen-ts_proto" \
  --ts_proto_out="$OUT_DIR" \
  --ts_proto_opt=outputServices=grpc-js,env=node,esModuleInterop=true,useOptionals=messages \
  --proto_path="$SCANNER_PROTO_DIR" \
  --proto_path="$REPORT_PROTO_DIR" \
  "$SCANNER_PROTO_DIR/scanner.proto" "$REPORT_PROTO_DIR/report.proto"

echo "Generated $OUT_DIR/scanner.ts and $OUT_DIR/report.ts"
