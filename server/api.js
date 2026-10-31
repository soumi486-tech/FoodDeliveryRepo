import { randomBytes } from 'node:crypto';
import express, { Router } from 'express';
import { pool, withTransaction } from './db.js';
import { HttpError, route, customerId, attachUser } from './http.js';
import { computeTotals } from '../shared/pricing.js';
import { CANCELLABLE, STATUSES, statusForAge } from '../shared/status.js';

export const api = Router();
api.use(express.json());
api.use(attachUser); // sets req.user from the session cookie (null when signed out)

// ---- mappers (numeric columns arrive as strings) ----
const toRestaurant = (r) => ({
  id: r.id, name: r.name, cuisine: r.cuisine, description: r.description, rating: Number(r.rating),
  etaMin: r.eta_min, etaMax: r.eta_max, deliveryFee: Number(r.delivery_fee), minOrder: Number(r.min_order),
  openTime: r.open_time, closeTime: r.close_time, tz: r.tz, open: isOpenNow(r), emoji: r.emoji, color: r.color,
});
const toItem = (m) => ({
  id: m.id, restaurantId: m.restaurant_id, category: m.category, name: m.name, description: m.description,
  price: Number(m.price), veg: m.veg, available: m.available, emoji: m.emoji,
});
const toOrder = (o, items = [], events = []) => ({
  id: o.id, restaurantId: o.restaurant_id, restaurantName: o.restaurant_name, createdAt: o.created_at,
  status: o.status, fulfilment: o.fulfilment, address: o.address, notes: o.notes, cardLast4: o.card_last4,
  subtotal: Number(o.subtotal), deliveryFee: Number(o.delivery_fee), tax: Number(o.tax), tip: Number(o.tip),
  total: Number(o.total),
  items: items.map((i) => ({ id: i.item_id, name: i.name, price: Number(i.price), qty: i.qty, emoji: i.emoji })),
  events: events.map((e) => ({ status: e.status, at: e.at })),
});

// Opening hours are evaluated in the restaurant's own timezone, never the server's or browser's.
function isOpenNow(r, now = new Date()) {
  if (!r.is_open) return false;
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: r.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return hhmm >= r.open_time && hhmm <= r.close_time;
}

const newOrderId = () => 'ORD-' + Date.now().toString(36).toUpperCase() + randomBytes(2).toString('hex').toUpperCase();
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

api.get('/health', route(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

// ---- public catalog ----
api.get('/restaurants', route(async (req, res) => {
  const q = str(req.query.q, 60).toLowerCase();
  const cuisine = str(req.query.cuisine, 40);
  const { rows } = await pool.query('SELECT * FROM restaurants ORDER BY length(id), id');
  const list = rows.map(toRestaurant).filter((r) =>
    (!cuisine || r.cuisine === cuisine) && (!q || `${r.name} ${r.cuisine} ${r.description}`.toLowerCase().includes(q)));
  res.json(list);
}));

api.get('/cuisines', route(async (req, res) => {
  const { rows } = await pool.query('SELECT DISTINCT cuisine FROM restaurants ORDER BY cuisine');
  res.json(rows.map((r) => r.cuisine));
}));

api.get('/restaurants/:id', route(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM restaurants WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Restaurant not found');
  const items = await pool.query('SELECT * FROM menu_items WHERE restaurant_id = $1 ORDER BY length(id), id', [req.params.id]);
  res.json({ ...toRestaurant(rows[0]), menu: items.rows.map(toItem) });
}));

// ---- orders (owner-scoped) ----
async function loadOrder(db, id, owner) {
  const o = await db.query('SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [id, owner]);
  if (!o.rows[0]) return null;
  const items = await db.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY item_id', [id]);
  const events = await db.query('SELECT status, at FROM order_events WHERE order_id = $1 ORDER BY id', [id]);
  return toOrder(o.rows[0], items.rows, events.rows);
}

// Demo simulator: there is no kitchen or courier, so status advances with elapsed time.
// Locked + re-checked inside a transaction, so concurrent GETs record each step exactly once.
async function advanceDemoStatus(id) {
  await withTransaction(async (tx) => {
    const { rows } = await tx.query('SELECT status, created_at FROM orders WHERE id = $1 FOR UPDATE', [id]);
    const o = rows[0];
    if (!o || o.status === 'cancelled') return;
    const age = (Date.now() - new Date(o.created_at).getTime()) / 1000;
    const from = STATUSES.indexOf(o.status);
    const to = STATUSES.indexOf(statusForAge(age));
    if (to <= from) return;
    for (let i = from + 1; i <= to; i++) await tx.query('INSERT INTO order_events (order_id, status) VALUES ($1, $2)', [id, STATUSES[i]]);
    await tx.query('UPDATE orders SET status = $2 WHERE id = $1', [id, STATUSES[to]]);
  });
}

api.get('/orders', route(async (req, res) => {
  const owner = customerId(req);
  const { rows } = await pool.query('SELECT id FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50', [owner]);
  const orders = [];
  for (const { id } of rows) {
    await advanceDemoStatus(id);
    orders.push(await loadOrder(pool, id, owner));
  }
  res.json(orders);
}));

api.get('/orders/:id', route(async (req, res) => {
  const owner = customerId(req);
  if (!(await loadOrder(pool, req.params.id, owner))) throw new HttpError(404, 'Order not found');
  await advanceDemoStatus(req.params.id);
  res.json(await loadOrder(pool, req.params.id, owner));
}));

api.post('/orders', route(async (req, res) => {
  const owner = customerId(req);
  const { restaurantId, items, fulfilment, address, notes, tip, cardLast4 } = req.body ?? {};
  if (typeof restaurantId !== 'string' || !restaurantId) throw new HttpError(400, 'restaurantId is required');
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'Your cart is empty');
  if (fulfilment !== 'delivery' && fulfilment !== 'pickup') throw new HttpError(400, 'fulfilment must be delivery or pickup');

  // Merge duplicate lines so quantity checks see the real total.
  const wanted = new Map();
  for (const line of items) {
    const qty = Number(line?.qty);
    if (typeof line?.id !== 'string' || !Number.isInteger(qty) || qty < 1 || qty > 50) throw new HttpError(400, 'Invalid item or quantity');
    wanted.set(line.id, (wanted.get(line.id) ?? 0) + qty);
  }
  if ([...wanted.values()].some((q) => q > 50)) throw new HttpError(400, 'Quantity limit is 50 per item');

  let addr = null;
  if (fulfilment === 'delivery') {
    addr = { name: str(address?.name, 80), phone: str(address?.phone, 30), street: str(address?.street, 120),
      city: str(address?.city, 60), zip: str(address?.zip, 12) };
    if (!addr.name || !addr.phone || !addr.street || !addr.city || !addr.zip) throw new HttpError(400, 'Please complete the delivery address');
  }
  const last4 = cardLast4 == null || cardLast4 === '' ? null : String(cardLast4);
  if (last4 !== null && !/^\d{4}$/.test(last4)) throw new HttpError(400, 'Only the last 4 card digits are accepted');

  const orderId = newOrderId();
  await withTransaction(async (tx) => {
    const r = await tx.query('SELECT * FROM restaurants WHERE id = $1', [restaurantId]);
    if (!r.rows[0]) throw new HttpError(400, 'Unknown restaurant');
    const restaurant = toRestaurant(r.rows[0]);
    if (!restaurant.open) throw new HttpError(409, `${restaurant.name} is closed right now`);

    const ids = [...wanted.keys()];
    const m = await tx.query('SELECT * FROM menu_items WHERE id = ANY($1) ORDER BY id FOR UPDATE', [ids]);
    const byId = new Map(m.rows.map((row) => [row.id, toItem(row)]));
    const lines = [];
    for (const id of ids) {
      const item = byId.get(id);
      if (!item || item.restaurantId !== restaurantId) throw new HttpError(400, 'Items must all come from the same restaurant');
      if (!item.available) throw new HttpError(409, `${item.name} is no longer available`);
      lines.push({ ...item, qty: wanted.get(id) });
    }

    const totals = computeTotals({ lines, restaurant, fulfilment, tip });
    if (totals.subtotal < restaurant.minOrder) {
      throw new HttpError(409, `Minimum order for ${restaurant.name} is $${restaurant.minOrder.toFixed(2)}`);
    }

    await tx.query(
      `INSERT INTO orders (id, customer_id, restaurant_id, restaurant_name, status, fulfilment, address, notes, card_last4,
         subtotal, delivery_fee, tax, tip, total)
       VALUES ($1,$2,$3,$4,'placed',$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [orderId, owner, restaurant.id, restaurant.name, fulfilment, addr, str(notes, 300), last4,
        totals.subtotal, totals.deliveryFee, totals.tax, totals.tip, totals.total]
    );
    for (const l of lines) {
      await tx.query('INSERT INTO order_items (order_id, item_id, name, price, qty, emoji) VALUES ($1,$2,$3,$4,$5,$6)',
        [orderId, l.id, l.name, l.price, l.qty, l.emoji]);
    }
    await tx.query("INSERT INTO order_events (order_id, status) VALUES ($1, 'placed')", [orderId]);
  });
  res.status(201).json(await loadOrder(pool, orderId, owner));
}));

api.post('/orders/:id/cancel', route(async (req, res) => {
  const owner = customerId(req);
  await advanceDemoStatus(req.params.id).catch(() => {});
  await withTransaction(async (tx) => {
    const { rows } = await tx.query('SELECT status FROM orders WHERE id = $1 AND customer_id = $2 FOR UPDATE', [req.params.id, owner]);
    if (!rows[0]) throw new HttpError(404, 'Order not found');
    if (!CANCELLABLE.includes(rows[0].status)) throw new HttpError(409, 'This order can no longer be cancelled');
    await tx.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [req.params.id]);
    await tx.query("INSERT INTO order_events (order_id, status) VALUES ($1, 'cancelled')", [req.params.id]);
  });
  res.json(await loadOrder(pool, req.params.id, owner));
}));

api.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
});
