import { test, expect } from '@playwright/test';
import { ADDRESS } from '../support/data.js';
import { apiUser, deliveryOrder, openRestaurant } from '../support/pages.js';

// Orders need an open restaurant (opening hours are evaluated in America/New_York).
let user; // per-test fresh user
let rest; // an open restaurant
let menu;

test.beforeEach(async ({ baseURL }) => {
  ({ ctx: user } = await apiUser(baseURL));
  rest = await openRestaurant(user);
  test.skip(!rest, 'No seeded restaurant is open at this time of day');
  menu = (await (await user.get(`/api/restaurants/${rest.id}`)).json()).menu;
});
test.afterEach(async () => { await user?.dispose(); });

// cheapest-sum helper: qty of first item large enough to clear the minimum order
const lineFor = (qty = 1, idx = 0) => ({ id: menu[idx].id, qty });
const enough = () => Math.ceil(rest.minOrder / menu[0].price) + 1;

test('places a delivery order with server-computed exact totals', async () => {
  const qty = enough();
  const res = await user.post('/api/orders', { data: deliveryOrder(rest.id, [lineFor(qty)], { tip: 2, notes: ' extra napkins ' }) });
  expect(res.status()).toBe(201);
  const o = await res.json();
  const subtotal = Math.round(menu[0].price * qty * 100) / 100;
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  expect(o.id).toMatch(/^ORD-/);
  expect(o.status).toBe('placed');
  expect(o.subtotal).toBe(subtotal);
  expect(o.deliveryFee).toBe(rest.deliveryFee);
  expect(o.tax).toBe(tax);
  expect(o.tip).toBe(2);
  expect(o.total).toBe(Math.round((subtotal + rest.deliveryFee + tax + 2) * 100) / 100);
  expect(o.notes).toBe('extra napkins');
  expect(o.cardLast4).toBe('4242');
  expect(o.address).toEqual(ADDRESS);
  expect(o.events.map((e) => e.status)).toEqual(['placed']);
  expect(o.items[0]).toMatchObject({ id: menu[0].id, name: menu[0].name, price: menu[0].price, qty });
  for (const k of ['subtotal', 'deliveryFee', 'tax', 'tip', 'total']) expect(typeof o[k]).toBe('number');
});

test('pickup order has no delivery fee, no tip, no address', async () => {
  const res = await user.post('/api/orders', { data: { restaurantId: rest.id, items: [lineFor(enough())], fulfilment: 'pickup', tip: 5 } });
  expect(res.status()).toBe(201);
  const o = await res.json();
  expect(o.deliveryFee).toBe(0);
  expect(o.tip).toBe(0);
  expect(o.address).toBeNull();
  expect(o.cardLast4).toBeNull();
});

test('server ignores client-supplied prices and totals', async () => {
  const qty = enough();
  const res = await user.post('/api/orders', {
    data: deliveryOrder(rest.id, [{ id: menu[0].id, qty, price: 0.01 }], { total: 0.01, subtotal: 0.01 }),
  });
  expect(res.status()).toBe(201);
  const o = await res.json();
  expect(o.items[0].price).toBe(menu[0].price);
  expect(o.subtotal).toBe(Math.round(menu[0].price * qty * 100) / 100);
});

test('tip is clamped to 50% of subtotal', async () => {
  const qty = enough();
  const o = await (await user.post('/api/orders', { data: deliveryOrder(rest.id, [lineFor(qty)], { tip: 9999 }) })).json();
  expect(o.tip).toBe(Math.round(o.subtotal * 0.5 * 100) / 100);
});

test('duplicate lines are merged', async () => {
  const half = enough();
  const o = await (await user.post('/api/orders', { data: deliveryOrder(rest.id, [lineFor(half), lineFor(1)]) })).json();
  expect(o.items).toHaveLength(1);
  expect(o.items[0].qty).toBe(half + 1);
});

const BAD = [
  ['missing restaurantId', (r) => ({ items: [{ id: 'x', qty: 1 }], fulfilment: 'pickup' }), 400, 'restaurantId is required'],
  ['empty cart', (r) => ({ restaurantId: r, items: [], fulfilment: 'pickup' }), 400, 'Your cart is empty'],
  ['bad fulfilment', (r, m) => ({ restaurantId: r, items: [{ id: m, qty: 1 }], fulfilment: 'drone' }), 400, 'fulfilment must be delivery or pickup'],
  ['qty zero', (r, m) => ({ restaurantId: r, items: [{ id: m, qty: 0 }], fulfilment: 'pickup' }), 400, 'Invalid item or quantity'],
  ['qty fractional', (r, m) => ({ restaurantId: r, items: [{ id: m, qty: 1.5 }], fulfilment: 'pickup' }), 400, 'Invalid item or quantity'],
  ['qty over 50', (r, m) => ({ restaurantId: r, items: [{ id: m, qty: 51 }], fulfilment: 'pickup' }), 400, 'Invalid item or quantity'],
  ['merged qty over 50', (r, m) => ({ restaurantId: r, items: [{ id: m, qty: 30 }, { id: m, qty: 30 }], fulfilment: 'pickup' }), 400, 'Quantity limit is 50 per item'],
  ['delivery without address', (r, m) => ({ restaurantId: r, items: [{ id: m, qty: 1 }], fulfilment: 'delivery' }), 400, 'Please complete the delivery address'],
  ['partial address', (r, m) => ({ restaurantId: r, items: [{ id: m, qty: 1 }], fulfilment: 'delivery', address: { ...ADDRESS, zip: '  ' } }), 400, 'Please complete the delivery address'],
  ['bad card digits', (r, m) => ({ restaurantId: r, items: [{ id: m, qty: 1 }], fulfilment: 'pickup', cardLast4: '4242424242424242' }), 400, 'Only the last 4 card digits are accepted'],
  ['unknown restaurant', (r, m) => ({ restaurantId: 'rX', items: [{ id: m, qty: 1 }], fulfilment: 'pickup' }), 400, 'Unknown restaurant'],
  ['unknown item', (r) => ({ restaurantId: r, items: [{ id: 'mX', qty: 1 }], fulfilment: 'pickup' }), 400, 'Items must all come from the same restaurant'],
];
for (const [title, build, status, error] of BAD) {
  test(`rejects: ${title}`, async () => {
    const res = await user.post('/api/orders', { data: build(rest.id, menu[0].id) });
    expect(res.status()).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(await (await user.get('/api/orders')).json()).toEqual([]); // nothing was stored
  });
}

test('items from another restaurant are rejected', async () => {
  const other = rest.id === 'r1' ? 'm14' : 'm1'; // m14 belongs to r4, m1 to r1
  const res = await user.post('/api/orders', { data: deliveryOrder(rest.id, [lineFor(1), { id: other, qty: 1 }]) });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBe('Items must all come from the same restaurant');
});

test('below minimum order returns 409 and stores nothing', async () => {
  test.skip(rest.minOrder <= menu[0].price, 'one item already meets the minimum');
  const res = await user.post('/api/orders', { data: deliveryOrder(rest.id, [lineFor(1)]) });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toBe(`Minimum order for ${rest.name} is $${rest.minOrder.toFixed(2)}`);
  expect(await (await user.get('/api/orders')).json()).toEqual([]);
});

test('closed restaurant returns 409', async () => {
  const list = await (await user.get('/api/restaurants')).json();
  const closed = list.find((r) => !r.open);
  test.skip(!closed, 'every restaurant is open right now');
  const m = (await (await user.get(`/api/restaurants/${closed.id}`)).json()).menu[0];
  const res = await user.post('/api/orders', { data: { restaurantId: closed.id, items: [{ id: m.id, qty: 5 }], fulfilment: 'pickup' } });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toBe(`${closed.name} is closed right now`);
});

test.describe('ownership and lifecycle', () => {
  test('owner sees the order; another customer gets 404', async ({ baseURL }) => {
    const { id } = await (await user.post('/api/orders', { data: deliveryOrder(rest.id, [lineFor(enough())]) })).json();
    expect((await user.get(`/api/orders/${id}`)).status()).toBe(200);
    expect((await (await user.get('/api/orders')).json()).map((o) => o.id)).toContain(id);

    const { ctx: other } = await apiUser(baseURL, 'Other');
    const res = await other.get(`/api/orders/${id}`);
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: 'Order not found' });
    expect(await (await other.get('/api/orders')).json()).toEqual([]);
    const cancel = await other.post(`/api/orders/${id}/cancel`);
    expect(cancel.status()).toBe(404);
    // still intact for the owner
    expect((await (await user.get(`/api/orders/${id}`)).json()).status).toBe('placed');
    await other.dispose();
  });

  test('unknown order id returns 404', async () => {
    const res = await user.get('/api/orders/ORD-NOPE');
    expect(res.status()).toBe(404);
  });

  test('cancel a placed order, then cancelling again is 409', async () => {
    const { id } = await (await user.post('/api/orders', { data: deliveryOrder(rest.id, [lineFor(enough())]) })).json();
    const res = await user.post(`/api/orders/${id}/cancel`);
    expect(res.status()).toBe(200);
    const o = await res.json();
    expect(o.status).toBe('cancelled');
    expect(o.events.map((e) => e.status)).toEqual(['placed', 'cancelled']);

    const again = await user.post(`/api/orders/${id}/cancel`);
    expect(again.status()).toBe(409);
    expect(await again.json()).toEqual({ error: 'This order can no longer be cancelled' });
  });

  test('orders are listed newest first', async () => {
    const a = await (await user.post('/api/orders', { data: deliveryOrder(rest.id, [lineFor(enough())]) })).json();
    const b = await (await user.post('/api/orders', { data: deliveryOrder(rest.id, [lineFor(enough())]) })).json();
    const ids = (await (await user.get('/api/orders')).json()).map((o) => o.id);
    expect(ids).toEqual([b.id, a.id]);
  });
});
