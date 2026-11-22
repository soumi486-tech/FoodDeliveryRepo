// Pure unit tests of shared/pricing.js and shared/status.js (no server needed).
import { test, expect } from '@playwright/test';
import { clampTip, computeTotals, round2 } from '../../shared/pricing.js';
import { CANCELLABLE, statusForAge } from '../../shared/status.js';

const restaurant = { deliveryFee: 2.49 };

test('delivery totals: subtotal, fee, 8% tax, tip', () => {
  const t = computeTotals({ lines: [{ price: 10.5, qty: 2 }, { price: 4, qty: 1 }], restaurant, fulfilment: 'delivery', tip: 3 });
  expect(t).toEqual({ subtotal: 25, deliveryFee: 2.49, tax: 2, tip: 3, total: 32.49 });
});

test('pickup has no delivery fee and ignores tip', () => {
  const t = computeTotals({ lines: [{ price: 10, qty: 1 }], restaurant, fulfilment: 'pickup', tip: 5 });
  expect(t).toEqual({ subtotal: 10, deliveryFee: 0, tax: 0.8, tip: 0, total: 10.8 });
});

test('empty cart has no delivery fee', () => {
  const t = computeTotals({ lines: [], restaurant, fulfilment: 'delivery' });
  expect(t.deliveryFee).toBe(0);
  expect(t.total).toBe(0);
});

test('tip is clamped to 50% of subtotal and invalid tips become 0', () => {
  expect(clampTip(100, 10)).toBe(5);
  expect(clampTip(-3, 10)).toBe(0);
  expect(clampTip('abc', 10)).toBe(0);
  expect(clampTip(NaN, 10)).toBe(0);
  expect(clampTip(2, 10)).toBe(2);
});

test('round2 avoids float drift', () => {
  expect(round2(0.1 + 0.2)).toBe(0.3);
  expect(round2(1.005 * 100)).toBe(100.5);
});

test('demo status schedule', () => {
  expect(statusForAge(0)).toBe('placed');
  expect(statusForAge(29)).toBe('placed');
  expect(statusForAge(30)).toBe('accepted');
  expect(statusForAge(120)).toBe('preparing');
  expect(statusForAge(360)).toBe('out_for_delivery');
  expect(statusForAge(720)).toBe('delivered');
  expect(CANCELLABLE).toEqual(['placed', 'accepted']);
});
