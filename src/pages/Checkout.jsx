import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { placeOrder } from '../api/client';
import { storage } from '../api/storage';
import { useCart } from '../context/CartContext';
import { money } from '../lib/format';

const TIPS = [0, 2, 3, 5];

export default function Checkout() {
  const cart = useCart();
  const navigate = useNavigate();
  const [fulfilment, setFulfilment] = useState('delivery');
  const [tip, setTip] = useState(2);
  const [notes, setNotes] = useState('');
  const [card, setCard] = useState('');
  const [address, setAddress] = useState(() => storage.get('address', { name: '', phone: '', street: '', city: '', zip: '' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Stay on the page while submitting: clearing the cart on success must not bounce the user to /cart-empty.
  if (cart.lines.length === 0 && !busy) {
    return <div className="empty"><p className="muted">Your cart is empty.</p><Link to="/" className="btn btn-primary">Browse restaurants</Link></div>;
  }

  const totals = cart.totalsFor(fulfilment, tip);
  const setField = (k) => (e) => setAddress({ ...address, [k]: e.target.value });
  const belowMin = cart.restaurant && totals.subtotal < cart.restaurant.minOrder;

  async function submit(e) {
    e.preventDefault();
    setError('');
    const digits = card.replace(/\D/g, '');
    if (digits.length < 4) return setError('Enter a card number (demo: only the last 4 digits are kept).');
    setBusy(true);
    try {
      storage.set('address', address);
      const order = await placeOrder({
        restaurantId: cart.restaurant.id,
        items: cart.lines.map((l) => ({ id: l.id, qty: l.qty })),
        fulfilment, address, notes, tip, cardLast4: digits.slice(-4),
      });
      cart.clear();
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="layout-2col" onSubmit={submit}>
      <div className="form">
        <h1>Checkout · {cart.restaurant.name}</h1>
        <div className="row">
          {['delivery', 'pickup'].map((f) => (
            <button type="button" key={f} className={`chip ${fulfilment === f ? 'on' : ''}`} onClick={() => setFulfilment(f)}>{f === 'delivery' ? 'Delivery' : 'Pickup'}</button>
          ))}
        </div>
        {fulfilment === 'delivery' && (
          <div className="panel form">
            <h2>Delivery address</h2>
            <div className="row">
              <label className="field">Name<input value={address.name} onChange={setField('name')} required /></label>
              <label className="field">Phone<input value={address.phone} onChange={setField('phone')} required /></label>
            </div>
            <label className="field">Street<input value={address.street} onChange={setField('street')} required /></label>
            <div className="row">
              <label className="field">City<input value={address.city} onChange={setField('city')} required /></label>
              <label className="field">ZIP<input value={address.zip} onChange={setField('zip')} required /></label>
            </div>
            <h2>Courier tip</h2>
            <div className="row">{TIPS.map((t) => <button type="button" key={t} className={`chip ${tip === t ? 'on' : ''}`} onClick={() => setTip(t)}>{money(t)}</button>)}</div>
          </div>
        )}
        <label className="field">Notes for the restaurant<textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} /></label>
        <label className="field">Card number (demo, only last 4 digits are stored)
          <input inputMode="numeric" placeholder="4242 4242 4242 4242" value={card} onChange={(e) => setCard(e.target.value)} />
        </label>
      </div>

      <aside className="panel">
        <h2>Your order</h2>
        {cart.lines.map((l) => (
          <div key={l.id} className="row between">
            <span>{l.emoji} {l.name}</span>
            <span className="stepper">
              <button type="button" className="btn btn-sm" onClick={() => cart.setQty(l.id, l.qty - 1)}>−</button>
              {l.qty}
              <button type="button" className="btn btn-sm" onClick={() => cart.setQty(l.id, Math.min(l.qty + 1, 50))}>+</button>
            </span>
          </div>
        ))}
        <hr />
        <div className="row between"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
        <div className="row between"><span>Delivery</span><span>{money(totals.deliveryFee)}</span></div>
        <div className="row between"><span>Tax</span><span>{money(totals.tax)}</span></div>
        {fulfilment === 'delivery' && <div className="row between"><span>Tip</span><span>{money(totals.tip)}</span></div>}
        <div className="row between"><strong>Total</strong><strong>{money(totals.total)}</strong></div>
        <p className="muted small">The server recalculates the final amount.</p>
        {belowMin && <p className="error small">Minimum order is {money(cart.restaurant.minOrder)}.</p>}
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || belowMin}>{busy ? 'Placing…' : `Place order · ${money(totals.total)}`}</button>
      </aside>
    </form>
  );
}
