import { test, expect } from '@playwright/test';
import { PASSWORD, uniqueEmail } from '../support/data.js';
import { uiSignUp } from '../support/pages.js';

test.describe('authentication UI', () => {
  test('protected pages redirect to login and return after sign-in @smoke', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login\?next=%2Forders/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    // create an account via the link, preserving ?next
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/signup\?next=%2Forders/);
    await page.getByLabel('Name').fill('Redirect T');
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByRole('heading', { name: 'My orders' })).toBeVisible();
  });

  test('signup shows the name in the header; account page; sign out', async ({ page }) => {
    const email = await uiSignUp(page, 'Ava Tester');
    await page.getByRole('link', { name: 'Ava Tester' }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('wrong password shows an error', async ({ page }) => {
    const email = await uiSignUp(page);
    await page.getByRole('link', { name: 'Test User' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible(); // signed out before moving on
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('sign in with existing account works', async ({ page }) => {
    const email = await uiSignUp(page, 'Sam Again');
    await page.getByRole('link', { name: 'Sam Again' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible(); // signed out before moving on
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('link', { name: 'Sam Again' })).toBeVisible();
  });

  test('open redirect via ?next is ignored', async ({ page }) => {
    await page.goto('/signup?next=//evil.example.com');
    await page.getByLabel('Name').fill('Safe');
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/localhost:3100\/$|\/$/);
    expect(new URL(page.url()).hostname).not.toBe('evil.example.com');
  });
});
