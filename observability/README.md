# Observability

- `observability.config.json`: domain metrics + load-test routes (edit, then re-run add-observability.mjs).
- `dashboard.json`: import in Grafana (Dashboards -> New -> Import) and pick the three Grafana Cloud data sources.
- `loadtest.mjs`: `node observability/loadtest.mjs [seconds=120] [workers=20]` (places real writes, capped).
