import { test, expect } from '@playwright/test';
import { RESTAURANTS } from '../support/data.js';

test.describe('home / catalog', () => {
  test('shows all six restaurants and the footer @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hungry? We deliver.' })).toBeVisible();
    await expect(page.locator('a.card')).toHaveCount(6);
    for (const r of Object.values(RESTAURANTS)) await expect(page.locator('a.card', { hasText: r.name })).toBeVisible();
    await expect(page.getByText('demo app, no real payments or deliveries')).toBeVisible();
  });

  test('search narrows results and shows an empty state', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Search restaurants or cuisines').fill('burger');
    await expect(page.locator('a.card')).toHaveCount(1);
    await expect(page.locator('a.card')).toContainText('Burger Barn');
    await page.getByPlaceholder('Search restaurants or cuisines').fill('qqqqqq');
    await expect(page.getByText('No restaurants match.')).toBeVisible();
  });

  test('cuisine chips filter and "All" resets', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Mexican' }).click();
    await expect(page.locator('a.card')).toHaveCount(1);
    await expect(page.locator('a.card')).toContainText('Taco Loco');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('a.card')).toHaveCount(6);
  });

  test('clicking a card opens its menu', async ({ page }) => {
    await page.goto('/');
    await page.locator('a.card', { hasText: 'Napoli Slice' }).click();
    await expect(page).toHaveURL(/\/restaurants\/r1$/);
    await expect(page.getByRole('heading', { name: /Napoli Slice/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pizza' })).toBeVisible();
    await expect(page.getByText('Margherita')).toBeVisible();
  });

  test('menu groups by category and veg-only filter hides non-veg', async ({ page }) => {
    await page.goto('/restaurants/r1');
    await expect(page.locator('.menu-item')).toHaveCount(5);
    await page.getByLabel('Vegetarian only').check();
    await expect(page.locator('.menu-item')).toHaveCount(3); // Margherita, Penne, Tiramisu
    await expect(page.getByText('Pepperoni')).toHaveCount(0);
    await page.getByLabel('Vegetarian only').uncheck();
    await expect(page.locator('.menu-item')).toHaveCount(5);
  });

  test('unknown restaurant and unknown route show Not Found', async ({ page }) => {
    await page.goto('/restaurants/nope');
    await expect(page.getByText(/not found/i).first()).toBeVisible();
    await page.goto('/this/route/does/not/exist');
    await expect(page.getByText(/not found/i).first()).toBeVisible();
  });
});
