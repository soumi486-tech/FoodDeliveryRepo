import { test, expect } from '@playwright/test';
import { apiUser, deliveryOrder, openRestaurant, uiSignUp } from '../support/pages.js';
import { PASSWORD } from '../support/data.js';

test.describe('orders page', () => {
  test('new user sees the empty state', async ({ page }) => {
    await uiSignUp(page);
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'My orders' })).toBeVisible();
    await expect(page.getByText('No orders yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Order food' })).toBeVisible();
  });

  test('an order created via API (same account) appears and opens', async ({ page, baseURL, request }) => {
    const { ctx, email } = await apiUser(baseURL, 'Api Maker');
    const r = await openRestaurant(ctx);
    test.skip(!r, 'No restaurant is open right now');
    const menu = (await (await ctx.get(`/api/restaurants/${r.id}`)).json()).menu;
    const qty = Math.ceil(r.minOrder / menu[0].price);
    const order = await (await ctx.post('/api/orders', { data: deliveryOrder(r.id, [{ id: menu[0].id, qty }]) })).json();

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('link', { name: 'Api Maker' })).toBeVisible(); // session established
    await page.goto('/orders');
    const row = page.locator('.order-row', { hasText: order.id });
    await expect(row).toContainText(r.name);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
    await expect(page.getByText(`${qty} × ${menu[0].name}`)).toBeVisible();
    await ctx.dispose();
  });

  test('another customer cannot open someone else\'s order', async ({ page, baseURL }) => {
    const { ctx } = await apiUser(baseURL, 'Owner');
    const r = await openRestaurant(ctx);
    test.skip(!r, 'No restaurant is open right now');
    const menu = (await (await ctx.get(`/api/restaurants/${r.id}`)).json()).menu;
    const order = await (await ctx.post('/api/orders', { data: deliveryOrder(r.id, [{ id: menu[0].id, qty: Math.ceil(r.minOrder / menu[0].price) }]) })).json();

    await uiSignUp(page, 'Intruder');
    await page.goto(`/orders/${order.id}`);
    await expect(page.getByText(/not found/i).first()).toBeVisible();
    await expect(page.getByText(order.id)).toHaveCount(0);
    await ctx.dispose();
  });

  test('unknown order id shows Not Found', async ({ page }) => {
    await uiSignUp(page);
    await page.goto('/orders/ORD-DOESNOTEXIST');
    await expect(page.getByText(/not found/i).first()).toBeVisible();
  });
});
