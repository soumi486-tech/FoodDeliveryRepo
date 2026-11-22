import { test, expect } from '@playwright/test';
import { ADDRESS, ITEMS, money } from '../support/data.js';
import { addItem, fillAddress, openRestaurantId, readCart, uiSignUp } from '../support/pages.js';

// Order flows need an open restaurant; pick whichever is open now and find an item to use.
async function pickOpen(request) {
  const id = await openRestaurantId(request);
  test.skip(!id, 'No seeded restaurant is open at this time of day');
  const res = await (await request.get(`/api/restaurants/${id}`)).json();
  return { r: res, item: res.menu[0] };
}

test.describe('cart', () => {
  test('add, increase, decrease, remove; header badge and persistence', async ({ page, request }) => {
    const { r, item } = await pickOpen(request);
    await page.goto(`/restaurants/${r.id}`);
    const card = page.locator('.menu-item').filter({ hasText: item.name }).first();
    await card.getByRole('button', { name: 'Add' }).click();
    await expect(card.locator('.stepper span')).toHaveText('1');
    await card.getByRole('button', { name: '+' }).click();
    await expect(card.locator('.stepper span')).toHaveText('2');
    await expect(page.getByRole('link', { name: /^Cart/ }).locator('.badge')).toHaveText('2');
    await expect(page.locator('.cartbar')).toContainText('2 items');
    await expect(page.locator('.cartbar')).toContainText(money(item.price * 2));

    await page.reload(); // cart persists in localStorage
    await expect(page.locator('.menu-item').filter({ hasText: item.name }).first().locator('.stepper span')).toHaveText('2');
    expect((await readCart(page)).lines[0]).toMatchObject({ id: item.id, qty: 2 });

    const c2 = page.locator('.menu-item').filter({ hasText: item.name }).first();
    await c2.getByRole('button', { name: '−' }).click();
    await c2.getByRole('button', { name: '−' }).click();
    await expect(c2.getByRole('button', { name: 'Add' })).toBeVisible();
    await expect(page.locator('.cartbar')).toHaveCount(0);
  });

  test('switching restaurants asks to start a new order', async ({ page }) => {
    await page.goto('/restaurants/r1');
    await page.locator('.menu-item').filter({ hasText: 'Margherita' }).getByRole('button', { name: 'Add' }).click().catch(() => {});
    // r1 may be closed (Add disabled); use the cart storage directly for determinism
    await page.evaluate(() => localStorage.setItem('fooddash:cart', JSON.stringify({
      restaurant: { id: 'r1', name: 'Napoli Slice', deliveryFee: 2.99, minOrder: 12 },
      lines: [{ id: 'm1', name: 'Margherita', price: 11.5, emoji: '🍕', qty: 1 }],
    })));
    await page.goto('/restaurants/r4');
    const smash = page.locator('.menu-item').filter({ hasText: 'Classic Smash' });
    test.skip(await smash.getByRole('button', { name: 'Add' }).isDisabled(), 'Burger Barn is closed');
    await smash.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Start a new order?')).toBeVisible();
    await page.getByRole('button', { name: 'Keep current cart' }).click();
    await expect(page.getByText('Start a new order?')).toHaveCount(0);
    expect((await readCart(page)).restaurant.id).toBe('r1');

    await smash.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: 'Start new order' }).click();
    const cart = await readCart(page);
    expect(cart.restaurant.id).toBe('r4');
    expect(cart.lines).toHaveLength(1);
  });

  test('empty checkout shows empty state (signed in)', async ({ page }) => {
    await uiSignUp(page);
    await page.goto('/checkout');
    await expect(page.getByText('Your cart is empty.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse restaurants' })).toBeVisible();
  });
});

test.describe('checkout', () => {
  test('full delivery order: totals, place, track, cancel @smoke', async ({ page, request }) => {
    const { r, item } = await pickOpen(request);
    const qty = Math.ceil(r.minOrder / item.price);
    await uiSignUp(page);
    await addItem(page, r.id, item.name, qty);
    await page.locator('.cartbar').click();
    await expect(page).toHaveURL(/\/checkout$/);

    const subtotal = Math.round(item.price * qty * 100) / 100;
    const tax = Math.round(subtotal * 0.08 * 100) / 100;
    const total = Math.round((subtotal + r.deliveryFee + tax + 2) * 100) / 100; // default tip $2
    await expect(page.getByRole('button', { name: /Place order/ })).toContainText(money(total));

    await fillAddress(page);
    await page.getByPlaceholder('4242 4242 4242 4242').fill('4242 4242 4242 4242');
    await page.getByLabel('Notes for the restaurant').fill('Ring the bell');
    await page.getByRole('button', { name: /Place order/ }).click();

    await expect(page).toHaveURL(/\/orders\/ORD-/);
    await expect(page.getByRole('heading', { name: new RegExp(r.name) })).toBeVisible();
    await expect(page.getByText('Order placed')).toBeVisible();
    await expect(page.getByText(`Deliver to ${ADDRESS.name}, ${ADDRESS.street}, ${ADDRESS.city} ${ADDRESS.zip}`)).toBeVisible();
    await expect(page.locator('.row', { hasText: 'Total' }).last()).toContainText(money(total));
    expect(await readCart(page)).toMatchObject({ lines: [] }); // cart cleared

    await page.getByRole('button', { name: 'Cancel order' }).click();
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);

    await page.getByRole('link', { name: '← My orders' }).click();
    await expect(page.locator('.order-row')).toHaveCount(1);
    await expect(page.locator('.order-row')).toContainText('Cancelled');
  });

  test('pickup hides address and tip, and removes delivery fee', async ({ page, request }) => {
    const { r, item } = await pickOpen(request);
    await uiSignUp(page);
    await addItem(page, r.id, item.name, Math.ceil(r.minOrder / item.price));
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Delivery address' })).toBeVisible();
    await page.getByRole('button', { name: 'Pickup' }).click();
    await expect(page.getByRole('heading', { name: 'Delivery address' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Courier tip' })).toHaveCount(0);
    await expect(page.locator('.row', { hasText: 'Delivery' }).filter({ hasText: '$0.00' }).first()).toBeVisible();
    await page.getByPlaceholder('4242 4242 4242 4242').fill('4242');
    await page.getByRole('button', { name: /Place order/ }).click();
    await expect(page).toHaveURL(/\/orders\/ORD-/);
    await expect(page.getByText('Deliver to')).toHaveCount(0);
  });

  test('tip buttons change the total', async ({ page, request }) => {
    const { r, item } = await pickOpen(request);
    await uiSignUp(page);
    await addItem(page, r.id, item.name, Math.ceil(r.minOrder / item.price) + 1);
    await page.goto('/checkout');
    const btn = page.getByRole('button', { name: /Place order/ });
    const before = await btn.textContent();
    await page.getByRole('button', { name: '$5.00' }).click();
    await expect(btn).not.toHaveText(before);
    await expect(page.locator('.row', { hasText: 'Tip' }).first()).toContainText('$5.00');
  });

  test('missing card number shows an error and sends no order request', async ({ page, request }) => {
    const { r, item } = await pickOpen(request);
    await uiSignUp(page);
    await addItem(page, r.id, item.name, Math.ceil(r.minOrder / item.price));
    await page.goto('/checkout');
    await fillAddress(page);
    const posts = [];
    page.on('request', (req) => { if (req.method() === 'POST' && req.url().endsWith('/api/orders')) posts.push(req); });
    await page.getByRole('button', { name: /Place order/ }).click();
    await expect(page.getByText('Enter a card number (demo: only the last 4 digits are kept).')).toBeVisible();
    expect(posts).toHaveLength(0);
  });

  test('address form validation blocks submit (required fields)', async ({ page, request }) => {
    const { r, item } = await pickOpen(request);
    await uiSignUp(page);
    await addItem(page, r.id, item.name, Math.ceil(r.minOrder / item.price));
    await page.goto('/checkout');
    await page.getByPlaceholder('4242 4242 4242 4242').fill('4242');
    const posts = [];
    page.on('request', (req) => { if (req.method() === 'POST' && req.url().endsWith('/api/orders')) posts.push(req); });
    await page.getByRole('button', { name: /Place order/ }).click();
    expect(posts).toHaveLength(0);
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('only the last 4 card digits are sent', async ({ page, request }) => {
    const { r, item } = await pickOpen(request);
    await uiSignUp(page);
    await addItem(page, r.id, item.name, Math.ceil(r.minOrder / item.price));
    await page.goto('/checkout');
    await fillAddress(page);
    await page.getByPlaceholder('4242 4242 4242 4242').fill('4111 1111 1111 9876');
    const reqPromise = page.waitForRequest((q) => q.method() === 'POST' && q.url().endsWith('/api/orders'));
    await page.getByRole('button', { name: /Place order/ }).click();
    const body = (await reqPromise).postData();
    expect(body).toContain('"cardLast4":"9876"');
    expect(body).not.toContain('4111');
    expect(body).not.toMatch(/total|subtotal/i);
  });

  test('below-minimum cart disables Place order and shows a message', async ({ page, request }) => {
    const { r, item } = await pickOpen(request);
    test.skip(r.minOrder <= item.price, 'one item meets the minimum');
    await uiSignUp(page);
    await addItem(page, r.id, item.name, 1);
    await page.goto('/checkout');
    await expect(page.getByText(`Minimum order is ${money(r.minOrder)}.`)).toBeVisible();
    await expect(page.getByRole('button', { name: /Place order/ })).toBeDisabled();
  });

  test('server 409 is shown and the cart is kept', async ({ page, request }) => {
    const { r, item } = await pickOpen(request);
    await uiSignUp(page);
    await addItem(page, r.id, item.name, Math.ceil(r.minOrder / item.price));
    await page.goto('/checkout');
    await fillAddress(page);
    await page.getByPlaceholder('4242 4242 4242 4242').fill('4242');
    await page.route('**/api/orders', (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: `${item.name} is no longer available` }) })
      : route.continue());
    await page.getByRole('button', { name: /Place order/ }).click();
    await expect(page.getByText(`${item.name} is no longer available`)).toBeVisible();
    expect((await readCart(page)).lines.length).toBe(1);
    await expect(page.getByRole('button', { name: /Place order/ })).toBeEnabled();
  });

  test('server 500 shows a generic error', async ({ page, request }) => {
    const { r, item } = await pickOpen(request);
    await uiSignUp(page);
    await addItem(page, r.id, item.name, Math.ceil(r.minOrder / item.price));
    await page.goto('/checkout');
    await fillAddress(page);
    await page.getByPlaceholder('4242 4242 4242 4242').fill('4242');
    await page.route('**/api/orders', (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal server error' }) })
      : route.continue());
    await page.getByRole('button', { name: /Place order/ }).click();
    await expect(page.getByText('Internal server error')).toBeVisible();
  });

  test('saved delivery address is prefilled on the next visit', async ({ page, request }) => {
    const { r, item } = await pickOpen(request);
    await uiSignUp(page);
    await addItem(page, r.id, item.name, Math.ceil(r.minOrder / item.price));
    await page.goto('/checkout');
    await fillAddress(page);
    await page.getByPlaceholder('4242 4242 4242 4242').fill('4242');
    await page.getByRole('button', { name: /Place order/ }).click();
    await expect(page).toHaveURL(/\/orders\/ORD-/);
    await addItem(page, r.id, item.name, Math.ceil(r.minOrder / item.price));
    await page.goto('/checkout');
    await expect(page.getByLabel('Street')).toHaveValue(ADDRESS.street);
    await expect(page.getByLabel('ZIP')).toHaveValue(ADDRESS.zip);
  });
});
