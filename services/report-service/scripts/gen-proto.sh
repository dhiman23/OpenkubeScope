#!/usr/bin/env bash
# Generates TypeScript types + gRPC stubs from BOTH proto files. report-service
# is a gRPC *server* for report.proto and a gRPC *client* of scanner.proto
# (it calls RbacScannerService.ListScansByCluster for scan data), so it needs
# both generated. Requires `protoc` on PATH (e.g. `brew install protobuf`).
set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROTO_DIR="$SERVICE_DIR/../../proto"
OUT_DIR="$SERVICE_DIR/src/generated"

mkdir -p "$OUT_DIR"

protoc \
  --plugin=protoc-gen-ts_proto="$SERVICE_DIR/node_modules/.bin/protoc-gen-ts_proto" \
  --ts_proto_out="$OUT_DIR" \
  --ts_proto_opt=outputServices=grpc-js,env=node,esModuleInterop=true,useOptionals=messages \
  --proto_path="$PROTO_DIR" \
  "$PROTO_DIR/scanner.proto" "$PROTO_DIR/report.proto"

echo "Generated $OUT_DIR/scanner.ts and $OUT_DIR/report.ts"
