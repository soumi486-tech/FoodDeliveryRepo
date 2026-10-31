// Rules shared by the browser (for display) and the server (authoritative).
export const round2 = (n) => Math.round(n * 100) / 100;

export const TAX_RATE = 0.08;
export const MAX_TIP_RATIO = 0.5;

export const clampTip = (tip, subtotal) => {
  const t = Number(tip);
  if (!Number.isFinite(t) || t < 0) return 0;
  return round2(Math.min(t, subtotal * MAX_TIP_RATIO));
};

// lines: [{price, qty}]; restaurant: {deliveryFee}; fulfilment: 'delivery' | 'pickup'
export function computeTotals({ lines, restaurant, fulfilment, tip = 0 }) {
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));
  const deliveryFee = fulfilment === 'delivery' && subtotal > 0 ? round2(restaurant.deliveryFee) : 0;
  const tax = round2(subtotal * TAX_RATE);
  const tipAmount = fulfilment === 'delivery' ? clampTip(tip, subtotal) : 0;
  return { subtotal, deliveryFee, tax, tip: tipAmount, total: round2(subtotal + deliveryFee + tax + tipAmount) };
}
