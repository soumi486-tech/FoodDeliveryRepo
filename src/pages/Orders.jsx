import { Link } from 'react-router-dom';
import { getOrders } from '../api/client';
import { STATUS_LABELS } from '../../shared/status';
import { useAsync } from '../hooks/useAsync';
import { formatTime, money } from '../lib/format';

export default function Orders() {
  const { data, loading, error } = useAsync(() => getOrders(), []);
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error.message}</p>;
  return (
    <>
      <h1>My orders</h1>
      {data.length === 0 && <div className="empty"><p className="muted">No orders yet.</p><Link to="/" className="btn btn-primary">Order food</Link></div>}
      {data.map((o) => (
        <Link key={o.id} to={`/orders/${o.id}`} className="panel order-row">
          <div><strong>{o.restaurantName}</strong><div className="muted small">{o.id} · {formatTime(o.createdAt)}</div></div>
          <div className="right"><div>{money(o.total)}</div><span className={`pill ${o.status === 'cancelled' ? 'off' : 'ok'}`}>{STATUS_LABELS[o.status]}</span></div>
        </Link>
      ))}
    </>
  );
}
