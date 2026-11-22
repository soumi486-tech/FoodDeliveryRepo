import { test, expect, request as pwRequest } from '@playwright/test';
import { PASSWORD, uniqueEmail } from '../support/data.js';

test.describe('authentication API', () => {
  test('signed-out users get 401 on order endpoints', async ({ request }) => {
    for (const [method, url] of [['get', '/api/orders'], ['get', '/api/orders/ORD-X'], ['post', '/api/orders'], ['post', '/api/orders/ORD-X/cancel']]) {
      const res = await request[method](url);
      expect(res.status(), `${method} ${url}`).toBe(401);
      expect(await res.json()).toEqual({ error: 'Please sign in' });
    }
  });

  test('catalog stays public', async ({ request }) => {
    expect((await request.get('/api/restaurants')).status()).toBe(200);
  });

  test('sign up, session, sign out, sign in', async ({ baseURL }) => {
    const ctx = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
    const email = uniqueEmail();
    const up = await ctx.post('/api/auth/sign-up/email', { data: { name: 'Auth T', email, password: PASSWORD } });
    expect(up.status()).toBe(200);
    expect((await up.json()).user.email).toBe(email);

    const session = await (await ctx.get('/api/auth/get-session')).json();
    expect(session.user.email).toBe(email);
    expect((await ctx.get('/api/orders')).status()).toBe(200);

    await ctx.post('/api/auth/sign-out', { data: {} });
    expect((await ctx.get('/api/orders')).status()).toBe(401);

    const inn = await ctx.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } });
    expect(inn.status()).toBe(200);
    expect((await ctx.get('/api/orders')).status()).toBe(200);
    await ctx.dispose();
  });

  test('wrong password is rejected', async ({ baseURL }) => {
    const ctx = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
    const email = uniqueEmail();
    await ctx.post('/api/auth/sign-up/email', { data: { name: 'Auth T', email, password: PASSWORD } });
    await ctx.post('/api/auth/sign-out', { data: {} });
    const res = await ctx.post('/api/auth/sign-in/email', { data: { email, password: 'wrong-password-1' } });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('duplicate email and short password are rejected', async ({ baseURL }) => {
    const ctx = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
    const email = uniqueEmail();
    const ok = await ctx.post('/api/auth/sign-up/email', { data: { name: 'Dup', email, password: PASSWORD } });
    expect(ok.status()).toBe(200);
    const dup = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
    const res = await dup.post('/api/auth/sign-up/email', { data: { name: 'Dup', email, password: PASSWORD } });
    expect(res.status()).toBeGreaterThanOrEqual(400);

    const short = await dup.post('/api/auth/sign-up/email', { data: { name: 'Short', email: uniqueEmail(), password: 'short' } });
    expect(short.status()).toBe(400);
    await ctx.dispose();
    await dup.dispose();
  });
});
