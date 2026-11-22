import { test, expect } from '@playwright/test';
import { CUISINES, ITEMS, RESTAURANTS } from '../support/data.js';

test('health check reports ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test('lists the 6 seeded restaurants with numeric fields', async ({ request }) => {
  const list = await (await request.get('/api/restaurants')).json();
  expect(list.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  for (const r of list) {
    expect(typeof r.rating).toBe('number');
    expect(typeof r.deliveryFee).toBe('number');
    expect(typeof r.minOrder).toBe('number');
    expect(typeof r.open).toBe('boolean');
    expect(r.deliveryFee).toBe(RESTAURANTS[r.id].fee);
    expect(r.minOrder).toBe(RESTAURANTS[r.id].min);
  }
});

test('cuisines are distinct and sorted', async ({ request }) => {
  expect(await (await request.get('/api/cuisines')).json()).toEqual(CUISINES);
});

test('filters by cuisine', async ({ request }) => {
  const list = await (await request.get('/api/restaurants?cuisine=Italian')).json();
  expect(list.map((r) => r.name)).toEqual(['Napoli Slice']);
});

test('search is case-insensitive and matches name, cuisine and description', async ({ request }) => {
  const byName = await (await request.get('/api/restaurants?q=DRAGON')).json();
  expect(byName.map((r) => r.id)).toEqual(['r3']);
  const byDesc = await (await request.get('/api/restaurants?q=tacos')).json();
  expect(byDesc.map((r) => r.id)).toEqual(['r6']);
  const none = await (await request.get('/api/restaurants?q=zzzzzz')).json();
  expect(none).toEqual([]);
});

test('restaurant detail includes its menu with numeric prices', async ({ request }) => {
  const r = await (await request.get('/api/restaurants/r4')).json();
  expect(r.name).toBe('Burger Barn');
  expect(r.menu.map((m) => m.id)).toEqual(['m14', 'm15', 'm16', 'm17']);
  const smash = r.menu.find((m) => m.id === 'm14');
  expect(smash.price).toBe(ITEMS.m14.price);
  expect(typeof smash.price).toBe('number');
  expect(smash.restaurantId).toBe('r4');
});

test('unknown restaurant and unknown route return JSON 404', async ({ request }) => {
  const a = await request.get('/api/restaurants/nope');
  expect(a.status()).toBe(404);
  expect(await a.json()).toEqual({ error: 'Restaurant not found' });
  const b = await request.get('/api/does-not-exist');
  expect(b.status()).toBe(404);
  expect(await b.json()).toEqual({ error: 'Not found' });
});
