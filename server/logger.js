// Console logger that also ships every line to Grafana Cloud (Loki) through the OpenTelemetry logs API.
//  - `log.info/warn/error(msg, attrs)` for new code (structured attributes).
//  - console.log/info/warn/error are forwarded too, so existing code needs no edits.
// The trace id is attached automatically while a span is active, so logs link to traces.
// Everything is a no-op when telemetry is disabled (no SDK registered).
// NOTE: the logs API is exported from '@opentelemetry/api' in the current SDK generation
// (the separate @opentelemetry/api-logs package is an old, disconnected copy: logs vanish silently).
import { format } from 'node:util';
import { logs, SeverityNumber } from '@opentelemetry/api';

const orig = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
const levels = {
  log: [SeverityNumber.INFO, 'INFO'],
  info: [SeverityNumber.INFO, 'INFO'],
  warn: [SeverityNumber.WARN, 'WARN'],
  error: [SeverityNumber.ERROR, 'ERROR'],
};

function ship(fn, body, attributes) {
  try {
    const [severityNumber, severityText] = levels[fn];
    logs.getLogger('app').emit({ severityNumber, severityText, body, attributes });
  } catch {
    /* telemetry must never break the app */
  }
}

if (!globalThis.__otelConsolePatched) {
  globalThis.__otelConsolePatched = true;
  for (const fn of Object.keys(orig)) {
    console[fn] = (...args) => {
      orig[fn](...args);
      ship(fn, format(...args));
    };
  }
}

function emit(fn, msg, attrs) {
  orig[fn](msg);
  ship(fn, String(msg), attrs);
}

export const log = {
  info: (msg, attrs) => emit('info', msg, attrs),
  warn: (msg, attrs) => emit('warn', msg, attrs),
  error: (msg, attrs) => emit('error', msg, attrs),
};
