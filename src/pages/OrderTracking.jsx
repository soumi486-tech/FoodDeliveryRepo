import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cancelOrder, getOrder } from '../api/client';
import { CANCELLABLE, PICKUP_LABELS, STATUSES, STATUS_LABELS } from '../../shared/status';
import { formatTime, money } from '../lib/format';
import NotFound from './NotFound';

export default function OrderTracking() {
  const { id } = useParams();
  const [order, setOrder] = useState(undefined);
  const [error, setError] = useState('');

  // Polls while the order is in flight; stops on unmount and once delivered/cancelled.
  useEffect(() => {
    let alive = true;
    let timer;
    const load = async () => {
      try {
        const o = await getOrder(id);
        if (!alive) return;
        setOrder(o);
        if (o && o.status !== 'delivered' && o.status !== 'cancelled') timer = setTimeout(load, 5000);
      } catch (e) {
        if (alive) setError(e.message);
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [id]);

  async function cancel() {
    setError('');
    try { setOrder(await cancelOrder(id)); } catch (e) { setError(e.message); }
  }

  if (order === undefined) return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;
  if (order === null) return <NotFound />;

  const label = (s) => (order.fulfilment === 'pickup' && PICKUP_LABELS[s]) || STATUS_LABELS[s];
  const reached = new Set(order.events.map((e) => e.status));
  const atOf = Object.fromEntries(order.events.map((e) => [e.status, e.at]));

  return (
    <section className="panel">
      <Link to="/orders" className="muted small">← My orders</Link>
      <h1>{order.restaurantName} · {order.id}</h1>
      <p className="muted small">Demo tracking: status advances automatically; no real kitchen or courier.</p>
      {order.status === 'cancelled'
        ? <p className="error"><strong>Cancelled</strong></p>
        : (
          <ol className="steps">
            {STATUSES.map((s) => (
              <li key={s} className={reached.has(s) ? 'done' : ''}>
                <span className="dot" />{label(s)} {atOf[s] && <span className="muted small">{formatTime(atOf[s])}</span>}
              </li>
            ))}
          </ol>
        )}
      {CANCELLABLE.includes(order.status) && <button className="btn" onClick={cancel}>Cancel order</button>}
      {error && <p className="error">{error}</p>}
      <h2>Items</h2>
      {order.items.map((i) => <div key={i.id} className="row between"><span>{i.emoji} {i.qty} × {i.name}</span><span>{money(i.price * i.qty)}</span></div>)}
      <hr />
      <div className="row between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
      <div className="row between"><span>Delivery</span><span>{money(order.deliveryFee)}</span></div>
      <div className="row between"><span>Tax</span><span>{money(order.tax)}</span></div>
      <div className="row between"><span>Tip</span><span>{money(order.tip)}</span></div>
      <div className="row between"><strong>Total</strong><strong>{money(order.total)}</strong></div>
      {order.address && <p className="muted small">Deliver to {order.address.name}, {order.address.street}, {order.address.city} {order.address.zip}</p>}
    </section>
  );
}
