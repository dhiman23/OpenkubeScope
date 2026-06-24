// OpenTelemetry bootstrap (Phase 4). Must be require()'d before any other
// module so auto-instrumentation can patch http/express/pg/grpc. server.ts
// imports this first.
//
// Claude's scope per the project split: wire the SDK in application code. The
// collector / Grafana / Tempo side (where OTEL_EXPORTER_OTLP_ENDPOINT points)
// is the user's DevOps scope. If the endpoint env var is unset, tracing is a
// no-op so local/dev runs need no collector.

import { NodeSDK } from "@opentelemetry/sdk-node"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"

let sdk: NodeSDK | null = null

export function startTelemetry(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!endpoint) {
    // No collector configured — skip. Keeps local dev dependency-free.
    return
  }

  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || "rbac-scanner-service",
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/traces` }),
    instrumentations: [getNodeAutoInstrumentations()],
  })

  sdk.start()
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown().catch(() => {})
    sdk = null
  }
}
