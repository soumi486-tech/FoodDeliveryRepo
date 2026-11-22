// Config-driven load test (no dependencies). Reads the "loadtest" block of observability/observability.config.json.
//   node observability/loadtest.mjs [seconds=120] [workers=20] [baseUrl=http://localhost:3000/api]
// Mix: mostly reads, plus 404 / 400 / 409 traffic and a CAPPED number of real writes (they change real data).
// With "auth": true it signs up ONE throwaway user (Better Auth email+password) and reuses its session cookie.
import fs from 'node:fs';

const seconds = Number(process.argv[2]) || 120;
const workers = Number(process.argv[3]) || 20;
const base = process.argv[4] || 'http://localhost:3000/api';
const cfg = JSON.parse(fs.readFileSync(new URL('./observability.config.json', import.meta.url), 'utf8')).loadtest ?? {};
const maxWrites = cfg.realWrite?.max ?? 10;
const json = { 'Content-Type': 'application/json' };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fill = (v, id) =>
  typeof v === 'string' ? v.split('{id}').join(id)
  : Array.isArray(v) ? v.map((x) => fill(x, id))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, id)]))
  : v;

// ---- optional throwaway user ----
let cookie = '';
let email = '';
if (cfg.auth) {
  email = `loadtest+${Date.now()}@example.com`;
  const res = await fetch(`${base}/auth/sign-up/email`, {
    method: 'POST',
    headers: { ...json, Origin: new URL(base).origin },
    body: JSON.stringify({ email, password: 'LoadTest-' + Date.now(), name: 'Load Test' }),
  });
  if (!res.ok) { console.error('Sign-up failed:', res.status, await res.text()); process.exit(1); }
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const authHeaders = cookie ? { Cookie: cookie, Origin: new URL(base).origin } : {};

// ---- ids for detail / write requests ----
let ids = [];
if (cfg.detail?.list) {
  const rows = await (await fetch(base + cfg.detail.list)).json();
  ids = (Array.isArray(rows) ? rows : rows.items ?? []).map((r) => r.id).filter(Boolean);
}
const anyId = () => (ids.length ? pick(ids) : 'x');

const send = (spec, id) =>
  fetch(base + fill(spec.path, id), {
    method: spec.method ?? 'POST',
    headers: { ...json, ...authHeaders },
    body: spec.body === undefined ? undefined : JSON.stringify(fill(spec.body, id)),
  });

let writes = 0;
async function one() {
  const r = Math.random();
  const reads = cfg.readPaths ?? ['/health'];
  if (r < 0.35) return fetch(base + pick(reads));
  if (r < 0.65 && cfg.detail?.path) return fetch(base + fill(cfg.detail.path, anyId()));
  if (r < 0.75 && cfg.authedReadPaths?.length) return fetch(base + pick(cfg.authedReadPaths), { headers: authHeaders });
  if (r < 0.81 && cfg.notFoundPath) return fetch(base + cfg.notFoundPath);
  if (r < 0.86 && cfg.badRequest) return send(cfg.badRequest, anyId());
  if (r < 0.92 && cfg.conflict) return send(cfg.conflict, anyId());
  if (r < 0.97 && cfg.realWrite && writes < maxWrites) { writes++; return send(cfg.realWrite, anyId()); }
  return fetch(base + pick(reads));
}

const stats = {};
const lat = [];
const end = Date.now() + seconds * 1000;
async function worker() {
  while (Date.now() < end) {
    const t = performance.now();
    try { const res = await one(); await res.arrayBuffer(); stats[res.status] = (stats[res.status] || 0) + 1; }
    catch { stats.fail = (stats.fail || 0) + 1; }
    lat.push(performance.now() - t);
  }
}
const tick = setInterval(() => console.log(`${Math.round((end - Date.now()) / 1000)}s left, ${lat.length} requests`), 15000);
await Promise.all(Array.from({ length: workers }, worker));
clearInterval(tick);
lat.sort((a, b) => a - b);
const q = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))].toFixed(0);
console.log(JSON.stringify({ requests: lat.length, rps: +(lat.length / seconds).toFixed(1), status: stats, realWrites: writes, ms: { p50: q(0.5), p95: q(0.95), p99: q(0.99) } }, null, 2));
if (email) console.log(`\nThrowaway user left behind: ${email}. Remove test users with: DELETE FROM "user" WHERE email LIKE 'loadtest+%@example.com';`);
