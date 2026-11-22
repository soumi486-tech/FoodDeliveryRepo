// Mirrors server/seed.js. If the seed changes, update here.
import { randomBytes } from 'node:crypto';

export const PASSWORD = 'test-pass-123';
export const ORIGIN = 'http://localhost:3100';

export const RESTAURANTS = {
  r1: { name: 'Napoli Slice', cuisine: 'Italian', fee: 2.99, min: 12 },
  r2: { name: 'Spice Route', cuisine: 'Indian', fee: 3.49, min: 15 },
  r3: { name: 'Dragon Wok', cuisine: 'Chinese', fee: 1.99, min: 10 },
  r4: { name: 'Burger Barn', cuisine: 'American', fee: 2.49, min: 8 },
  r5: { name: 'Green Bowl', cuisine: 'Healthy', fee: 2.99, min: 10 },
  r6: { name: 'Taco Loco', cuisine: 'Mexican', fee: 2.49, min: 9 },
};
export const CUISINES = ['American', 'Chinese', 'Healthy', 'Indian', 'Italian', 'Mexican'];

export const ITEMS = {
  m1: { rid: 'r1', name: 'Margherita', price: 11.5, veg: true },
  m2: { rid: 'r1', name: 'Pepperoni', price: 13.5, veg: false },
  m5: { rid: 'r1', name: 'Tiramisu', price: 6.5, veg: true },
  m14: { rid: 'r4', name: 'Classic Smash', price: 10.5, veg: false },
  m15: { rid: 'r4', name: 'Veggie Burger', price: 10.0, veg: true },
  m16: { rid: 'r4', name: 'Fries', price: 4.0, veg: true },
  m17: { rid: 'r4', name: 'Chocolate Shake', price: 5.5, veg: true },
  m10: { rid: 'r3', name: 'Chow Mein', price: 11.0, veg: true },
  m18: { rid: 'r5', name: 'Teriyaki Chicken Bowl', price: 12.5, veg: false },
};

export const ADDRESS = { name: 'Test User', phone: '555-0100', street: '1 Test St', city: 'Testville', zip: '10001' };

export const uniq = () => `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
export const uniqueEmail = () => `fdtest_${uniq()}@example.test`;
export const money = (n) => `$${Number(n).toFixed(2)}`;
export const round2 = (n) => Math.round(n * 100) / 100;
