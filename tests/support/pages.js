import { expect, request as pwRequest } from '@playwright/test';
import { ADDRESS, PASSWORD, uniqueEmail } from './data.js';

// ---------- API helpers ----------
// Signs up a throwaway user in a fresh request context (own cookie jar). Returns { ctx, email, user }.
export async function apiUser(baseURL, name = 'Test User') {
  const ctx = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const email = uniqueEmail();
  const res = await ctx.post('/api/auth/sign-up/email', { data: { name, email, password: PASSWORD } });
  expect(res.status(), 'sign-up').toBe(200);
  const body = await res.json();
  return { ctx, email, user: body.user };
}

// First restaurant that is open right now (opening hours are time-dependent), or null.
export async function openRestaurant(ctx, preferred = ['r4', 'r1', 'r6', 'r3', 'r2', 'r5']) {
  const list = await (await ctx.get('/api/restaurants')).json();
  for (const id of preferred) {
    const r = list.find((x) => x.id === id);
    if (r?.open) return r;
  }
  return null;
}

export const firstItemOf = async (ctx, rid) => (await (await ctx.get(`/api/restaurants/${rid}`)).json()).menu;

export const deliveryOrder = (restaurantId, items, extra = {}) => ({
  restaurantId, items, fulfilment: 'delivery', address: ADDRESS, notes: '', tip: 0, cardLast4: '4242', ...extra,
});

// ---------- UI helpers ----------
export async function uiSignUp(page, name = 'Test User') {
  const email = uniqueEmail();
  await page.goto('/signup');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('link', { name })).toBeVisible();
  return email;
}

// Adds an item (by visible name) on a restaurant page.
export async function addItem(page, restaurantId, itemName, times = 1) {
  await page.goto(`/restaurants/${restaurantId}`);
  const card = page.locator('.menu-item').filter({ hasText: itemName }).first();
  await card.getByRole('button', { name: 'Add' }).click();
  for (let i = 1; i < times; i++) await card.getByRole('button', { name: '+' }).click();
}

export async function fillAddress(page, a = ADDRESS) {
  await page.getByLabel('Name', { exact: true }).fill(a.name);
  await page.getByLabel('Phone').fill(a.phone);
  await page.getByLabel('Street').fill(a.street);
  await page.getByLabel('City').fill(a.city);
  await page.getByLabel('ZIP').fill(a.zip);
}

export const readCart = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fooddash:cart') || 'null'));

// Returns the id of an open restaurant for the UI (via the page's request context).
export async function openRestaurantId(request) {
  const r = await openRestaurant(request);
  return r?.id ?? null;
}
