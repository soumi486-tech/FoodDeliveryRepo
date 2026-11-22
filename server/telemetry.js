// Request metrics + domain (business) metrics. Generated from observability/observability.config.json
// by the build-fullstack-Observability-grafana skill. Safe to hand-edit; re-running the script will not overwrite it
// unless --force is passed.
//
// Usage in routes:   import { biz } from './telemetry.js';   biz.created.add(1, { resource: id });
import { metrics } from '@opentelemetry/api';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { log } from './logger.js';

// All instruments are no-ops unless instrumentation.js started the SDK.
const meter = metrics.getMeter('fooddash');

const httpRequests = meter.createCounter('fooddash_http_requests', { description: 'API requests' });
const httpDuration = meter.createHistogram('fooddash_http_request_duration', { description: 'API request duration', unit: 'ms' });

// ---- domain metrics (keys are what route code uses: biz.<key>.add(...) / biz.<key>.record(...)) ----
export const biz = {
  created: meter.createCounter("fooddash_orders_created", { description: "Food orders placed" }),
  cancelled: meter.createCounter("fooddash_orders_cancelled", { description: "Orders cancelled" }),
  delivered: meter.createCounter("fooddash_orders_delivered", { description: "Orders that reached the delivered status" }),
  conflicts: meter.createCounter("fooddash_order_rejections", { description: "Orders rejected (item unavailable / restaurant closed / mixed restaurants)" }),
  value: meter.createHistogram("fooddash_order_value", { description: "Order total (currency units)" }),
};

// ---- process health: observable gauges, no extra dependencies ----
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
meter
  .createObservableGauge('fooddash_process_memory_rss', { description: 'Resident set size', unit: 'By' })
  .addCallback((r) => r.observe(process.memoryUsage().rss));
meter
  .createObservableGauge('fooddash_event_loop_delay_p99', { description: 'Event loop delay p99', unit: 's' })
  .addCallback((r) => {
    r.observe(loopDelay.percentile(99) / 1e9);
    loopDelay.reset();
  });

// Express middleware: one metric sample + one access-log line per API request.
// `route` is the matched PATTERN (/bookings/:id), never the raw URL, to keep label cardinality low.
// The log line deliberately omits the query string (may carry tokens) and request bodies (PII).
export function requestTelemetry(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const route = req.route ? req.baseUrl + req.route.path : 'unmatched';
    const attrs = { method: req.method, route, status: String(res.statusCode) };
    httpRequests.add(1, attrs);
    httpDuration.record(ms, attrs);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[level](`${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${ms.toFixed(0)}ms`, {
      route,
      status: res.statusCode,
      duration_ms: Math.round(ms),
    });
  });
  next();
}
