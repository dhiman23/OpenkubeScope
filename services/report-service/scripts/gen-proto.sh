#!/usr/bin/env bash
# Generates TypeScript types + gRPC stubs from BOTH proto files. report-service
# is a gRPC *server* for report.proto and a gRPC *client* of scanner.proto
# (it calls RbacScannerService.ListScansByCluster for scan data), so it needs
# both generated. Requires `protoc` on PATH (e.g. `brew install protobuf`).
set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# report.proto lives here (this service owns it); scanner.proto is owned by
# rbac-scanner-service, so we read it from there. report.proto's
# `import "scanner.proto"` resolves via the second --proto_path.
PROTO_DIR="$SERVICE_DIR/proto"
SCANNER_PROTO_DIR="$SERVICE_DIR/../rbac-scanner-service/proto"
OUT_DIR="$SERVICE_DIR/src/generated"

mkdir -p "$OUT_DIR"

protoc \
  --plugin=protoc-gen-ts_proto="$SERVICE_DIR/node_modules/.bin/protoc-gen-ts_proto" \
  --ts_proto_out="$OUT_DIR" \
  --ts_proto_opt=outputServices=grpc-js,env=node,esModuleInterop=true,useOptionals=messages \
  --proto_path="$PROTO_DIR" \
  --proto_path="$SCANNER_PROTO_DIR" \
  "$SCANNER_PROTO_DIR/scanner.proto" "$PROTO_DIR/report.proto"

echo "Generated $OUT_DIR/scanner.ts and $OUT_DIR/report.ts"
