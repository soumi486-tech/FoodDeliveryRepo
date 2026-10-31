# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # http://localhost:3000, Express with Vite embedded as middleware (HMR); restarts on server/ or shared/ changes
npm run build    # vite build -> dist/
npm start        # production: Express serves dist/ + /api on $PORT (default 3000)
```

There is no test suite or linter configured. Verify API changes by running the dev server and hitting `/api/*` with curl. For signed-in endpoints, sign up a throwaway user with a cookie jar (`curl -c jar -H "Origin: http://localhost:3000" -H "Content-Type: application/json" -d '{"name":"T","email":"t1@example.test","password":"test-pass-123"}' localhost:3000/api/auth/sign-up/email`), then pass `-b jar`. Delete the test users afterwards.

Requires Node >= 22 and `DATABASE_URL` (Neon serverless Postgres connection string) in `.env` or the environment. Without it, the server exits at startup.

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
