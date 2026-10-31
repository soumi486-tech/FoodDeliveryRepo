import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRestaurant } from '../api/client';
import { useCart } from '../context/CartContext';
import { useAsync } from '../hooks/useAsync';
import { money } from '../lib/format';
import NotFound from './NotFound';

export default function RestaurantMenu() {
  const { id } = useParams();
  const { data: r, loading, error } = useAsync(() => getRestaurant(id), [id]);
  const cart = useCart();
  const [vegOnly, setVegOnly] = useState(false);
  const [pending, setPending] = useState(null);

  const groups = useMemo(() => {
    const g = new Map();
    for (const m of r?.menu ?? []) {
      if (vegOnly && !m.veg) continue;
      g.set(m.category, [...(g.get(m.category) ?? []), m]);
    }
    return [...g];
  }, [r, vegOnly]);

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error.message}</p>;
  if (!r) return <NotFound />;

  const qtyOf = (itemId) => cart.lines.find((l) => l.id === itemId)?.qty ?? 0;
  const add = (item) => {
    if (cart.restaurant && cart.restaurant.id !== r.id) setPending(item);
    else cart.add(r, item);
  };

  return (
    <>
      <Link to="/" className="muted small">← All restaurants</Link>
      <section className="hero" style={{ background: r.color }}>
        <h1>{r.emoji} {r.name}</h1>
        <p>{r.description}</p>
        <p className="small">{r.cuisine} · ⭐ {r.rating.toFixed(1)} · {r.etaMin}-{r.etaMax} min · Delivery {money(r.deliveryFee)} · Min order {money(r.minOrder)} · {r.open ? 'Open now' : `Closed (hours ${r.openTime}-${r.closeTime})`}</p>
      </section>
      <label className="row small"><input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} /> Vegetarian only</label>

      {pending && (
        <div className="panel warn">
          <p>Start a new order? Your cart has items from <strong>{cart.restaurant.name}</strong>; adding this clears it.</p>
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={() => { cart.clear(); cart.add(r, pending); setPending(null); }}>Start new order</button>
            <button className="btn btn-sm" onClick={() => setPending(null)}>Keep current cart</button>
          </div>
        </div>
      )}

      {groups.map(([cat, items]) => (
        <section key={cat}>
          <h2>{cat}</h2>
          <div className="menu">
            {items.map((m) => (
              <div key={m.id} className="panel menu-item">
                <div className="emoji">{m.emoji}</div>
                <div className="grow">
                  <strong>{m.name}</strong> {m.veg && <span className="pill ok">Veg</span>}
                  <div className="muted small">{m.description}</div>
                  <div>{money(m.price)}</div>
                </div>
                {!m.available ? <span className="muted small">Unavailable</span>
                  : qtyOf(m.id) === 0 ? <button className="btn btn-sm btn-primary" onClick={() => add(m)} disabled={!r.open}>Add</button>
                  : (
                    <div className="stepper">
                      <button className="btn btn-sm" onClick={() => cart.setQty(m.id, qtyOf(m.id) - 1)}>−</button>
                      <span>{qtyOf(m.id)}</span>
                      <button className="btn btn-sm" onClick={() => cart.setQty(m.id, Math.min(qtyOf(m.id) + 1, 50))}>+</button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {cart.restaurant?.id === r.id && cart.count > 0 && (
        <Link to="/checkout" className="cartbar">View cart · {cart.count} item{cart.count > 1 ? 's' : ''} · {money(cart.totalsFor('pickup', 0).subtotal)}</Link>
      )}
    </>
  );
}
