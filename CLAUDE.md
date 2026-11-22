# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # http://localhost:3000, Express with Vite embedded as middleware (HMR); restarts on server/ or shared/ changes
npm run build    # vite build -> dist/
npm start        # production: Express serves dist/ + /api on $PORT (default 3000)
```

There is no linter. The Playwright suite is described under **Tests** below. Verify API changes by running the dev server and hitting `/api/*` with curl. For signed-in endpoints, sign up a throwaway user with a cookie jar (`curl -c jar -H "Origin: http://localhost:3000" -H "Content-Type: application/json" -d '{"name":"T","email":"t1@example.test","password":"test-pass-123"}' localhost:3000/api/auth/sign-up/email`), then pass `-b jar`. Delete the test users afterwards.

Requires Node >= 22, `DATABASE_URL` (Neon serverless Postgres connection string) and `BETTER_AUTH_SECRET` (32+ random chars) in `.env` or the environment. Without the database URL, the server exits at startup; auth needs the secret.

If port 3000 is taken (common here), run `$env:PORT=3100; npm run dev` in PowerShell. Stray `node server/index.js --dev` processes from earlier sessions can hold ports; stop them first.

Manual curl testing writes to whatever database `.env` points at (local dev and Render share one `DATABASE_URL`). Afterwards delete throwaway users (`fdtest_*@example.test`), their `orders` (cascades to items/events) and sessions/accounts, leaving only the seeded restaurants and menu. The Playwright suite uses its own test database and cleans up automatically; see **Tests**.

## Deployment

Live on Render (free plan, service `fooddash`, auto-deploys on every push to `main` of `soumi486-tech/FoodDeliveryRepo`). It was created through the Render API, not a Blueprint, so editing `render.yaml` changes nothing; change settings via the dashboard/API. `BETTER_AUTH_URL` must equal the real service URL (`https://fooddash-q72y.onrender.com`); changing an env var through the API does not redeploy by itself, so trigger a deploy (`POST /services/{id}/deploys`) and confirm with a sign-up (stale value gives `INVALID_ORIGIN`). The free service sleeps after ~15 minutes idle. Deploy tooling lives in the user's `build-fullstack-app-reat-node` skill (`~/.claude/skills/`).

## Architecture

**One process, one port, one deployable artifact.** This is a deliberate requirement: do not split the frontend and backend into separate servers or packages. `server/index.js` mounts the API at `/api`. In development (`--dev` flag) it then embeds Vite in middleware mode, sharing the HTTP server for HMR. Otherwise it serves `dist/` with an SPA fallback.

**Layers:**
- `src/`: React 18 SPA (react-router v6). All network access goes through `src/api/client.js`. A GET that returns 404 resolves to `null`; other errors throw with the server's `error` message.
- `server/api.js`: Express router with all routes and validation. Async handlers must be wrapped in `route()` (Express 4). Throw `HttpError(status, msg)` for client errors; anything else becomes a logged 500. Helpers live in `server/http.js`.
- `server/db.js`: Neon `Pool` (node-postgres-compatible over WebSockets). `migrate()` runs on every startup: applies the idempotent `server/schema.js`, then `server/seed.js`. Use `withTransaction(fn)` for multi-statement writes.
- `shared/`: rules (pricing, slots, ...) imported by both client (display) and server (authoritative).

**Where state lives:** Postgres: `restaurants`, `menu_items`, `orders`, `order_items` (name/price copied at order time), `order_events` (status history), plus Better Auth tables. Browser localStorage (prefix `fooddash:`): `cart` (one restaurant only) and the last delivery `address`.

**Trust boundary:** The client sends only `{restaurantId, items:[{id,qty}], fulfilment, address, notes, tip, cardLast4}`. The server loads prices, enforces same-restaurant items, availability, opening hours (restaurant timezone) and minimum order, clamps the tip, and computes totals via `shared/pricing.js` inside one transaction (menu rows locked `FOR UPDATE`). Order status is a time-based demo simulator (`advanceDemoStatus` in `api.js`, schedule in `shared/status.js`), advanced under a row lock when an order is read, so concurrent reads record each step once. Cancel is allowed only while placed/accepted.

**Authentication: Better Auth** (email + password, cookie sessions). `server/auth.js` configures it and `migrateAuth()` creates its `user`/`session`/`account`/`verification` tables on every start; `index.js` mounts it at `/api/auth/*` BEFORE any body parser. `attachUser` (in `api.js`) sets `req.user`; `customerId(req)` returns the user id or throws 401, so every owner-scoped read AND write goes through it (404, not 403, for other people's records). Catalog reads stay public. Client: `src/lib/auth.js` (`useSession`, `signIn`, `signUp`, `signOut`), `RequireAuth` guards pages, `Login` serves `/login` and `/signup`. Domain tables store the user id as plain text `customer_id` (no FK to the auth tables).

## Gotchas

- Postgres `numeric` columns come back as strings. Convert them with `toX` mappers before returning JSON.
- Don't read files under `server/` or `shared/` at runtime, and don't use `node --env-file`. On Windows, `node --watch-path` treats those reads as changes, causing a dev restart loop. `.env` is loaded in code by `server/env.js` (must stay the first import in `index.js`), and the schema is a JS module, not `.sql`.
- React, Vite and the router are devDependencies (build-time only). Run `npm run build` before pruning dev dependencies.

## Observability (Grafana Cloud)

Traces, metrics and logs go to Grafana Cloud over OTLP, configured only through `OTEL_*` vars in `.env` (see `.env.example`; headers value is `Authorization=Basic%20<base64 instanceId:token>`, space as `%20`). Unsetting `OTEL_EXPORTER_OTLP_ENDPOINT` disables it entirely. Never commit the token.

- `server/instrumentation.js` starts the OpenTelemetry NodeSDK. It must be the second import in `index.js`, right after `env.js`. Only `/api` requests are traced.
- `server/logger.js`: `log.info/warn/error`, and it forwards plain `console.*` too. Don't log request bodies, tokens or connection strings.
- `server/telemetry.js`: request metrics (`fooddash_http_requests`, `fooddash_http_request_duration`), process gauges, and the domain metrics in `biz` (see `observability/observability.config.json`). Call `biz.<key>.add(1)` where the event succeeds or is rejected.
- `server/db.js` wraps `withTransaction` in a `db.transaction` span; this driver isn't auto-instrumented, so only transactions are spans.
- `observability/dashboard.json` is imported into Grafana; `observability/loadtest.mjs` generates traffic (writes real data, capped).
- This OTel SDK generation: the logs API comes from `@opentelemetry/api` (not `api-logs`) and `BatchLogRecordProcessor` takes `{ exporter }`. Wrong usage fails silently; prove export with `verify-telemetry.mjs` (local listener) rather than assuming.

## Tests (Playwright)

```bash
npm test                 # everything: api + chromium e2e + mobile @smoke (~2.5 min, 73 tests)
npm run test:api         # API + pricing unit tests (42)
npm run test:e2e         # desktop Chromium UI tests
npm run test:smoke       # @smoke tests only (desktop + Pixel 7)
npm run test:report      # open the HTML report of the last run
npx playwright test tests/api/orders.spec.js -g "cancel"   # single test
$env:PW_CHANNEL='chrome'; npx playwright test --project=chromium --headed   # headed (bundled Chromium can crash headed on Windows)
```

- Playwright starts the app itself on **port 3100** (`node server/index.js --dev`), so it never collides with the dev server on 3000. Set `BASE_URL` to test an already-running/deployed instance instead (no local server).
- **Database:** tests read `DATABASE_URL` from gitignored `.env.test` (see `.env.test.example`), which overrides `.env`. It points at a separate Neon test database, not the one Render uses. Telemetry is disabled for test runs.
- Tests create real users (`fdtest_*@example.test`) and orders. `tests/support/global-teardown.js` deletes them after every run; if a run is killed, the next run's teardown cleans the leftovers.
- Seed coupling: `tests/support/data.js` mirrors `server/seed.js` (restaurant ids/names/fees/minimums, menu prices). Update both together.
- Opening hours are time-dependent (America/New_York). Order tests pick a restaurant that is open now and `test.skip` when none is; the "closed restaurant" and "below minimum" tests skip when the data makes them inapplicable, so 2-3 skips is normal.
- Layout: `tests/api` (catalog, auth, orders, pricing/status unit tests), `tests/e2e` (catalog, auth, cart-checkout, orders), `tests/support` (data, page helpers, teardown).
