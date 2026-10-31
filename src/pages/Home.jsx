import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getCuisines, getRestaurants } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { money } from '../lib/format';

export default function Home() {
  const [q, setQ] = useState('');
  const [cuisine, setCuisine] = useState('');
  const cuisines = useAsync(() => getCuisines(), []);
  const list = useAsync(() => getRestaurants({ q, cuisine }), [q, cuisine]);

  return (
    <>
      <section className="hero">
        <h1>Hungry? We deliver.</h1>
        <p className="muted">Order from local restaurants. Demo app: no real payment or couriers.</p>
        <input className="search" placeholder="Search restaurants or cuisines" value={q} onChange={(e) => setQ(e.target.value)} />
      </section>
      <div className="chips">
        {['', ...(cuisines.data ?? [])].map((c) => (
          <button key={c || 'all'} className={`chip ${cuisine === c ? 'on' : ''}`} onClick={() => setCuisine(c)}>{c || 'All'}</button>
        ))}
      </div>
      {list.error && <p className="error">{list.error.message}</p>}
      {list.loading && !list.data && <p className="muted">Loading…</p>}
      {list.data?.length === 0 && <p className="empty muted">No restaurants match.</p>}
      <div className="grid">
        {list.data?.map((r) => (
          <Link key={r.id} to={`/restaurants/${r.id}`} className="card">
            <div className="card-art" style={{ background: r.color }}>{r.emoji}</div>
            <div className="card-body">
              <div className="row between"><strong>{r.name}</strong><span className={`pill ${r.open ? 'ok' : 'off'}`}>{r.open ? 'Open' : 'Closed'}</span></div>
              <div className="muted small">{r.cuisine} · ⭐ {r.rating.toFixed(1)} · {r.etaMin}-{r.etaMax} min</div>
              <div className="muted small">Delivery {money(r.deliveryFee)} · Min {money(r.minOrder)}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
