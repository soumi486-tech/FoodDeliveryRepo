// OpenTelemetry bootstrap: sends traces, metrics and logs to Grafana Cloud over OTLP.
// Import it SECOND in server/index.js, right after ./env.js and before express/http/db are used.
// Configured only through OTEL_* env vars; unset OTEL_EXPORTER_OTLP_ENDPOINT to disable everything.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
// (DB spans: manual db.transaction span in db.js; this driver is not auto-instrumented)
import './logger.js'; // also forwards console.* to the log pipeline

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'fooddash',
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 15000,
    }),
    // NOTE: this SDK generation takes an options object ({ exporter }), not the exporter itself.
    // Passing the exporter directly fails SILENTLY (nothing is ever exported).
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      // Trace only the API; Vite assets / SPA fallback would drown the signal.
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => !req.url?.startsWith('/api'),
      }),
      new ExpressInstrumentation(),

    ],
  });
  sdk.start();
  // Flush on shutdown so the last seconds of telemetry are not lost.
  const stop = () => sdk.shutdown().finally(() => process.exit(0));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
