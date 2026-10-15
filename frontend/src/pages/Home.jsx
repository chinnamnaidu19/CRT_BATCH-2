import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import ItemCard from '../components/ItemCard.jsx';
import { getStorefront } from '../services/flowService.js';

const TILE_COLORS = ['#4f46e5', '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#64748b'];

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => { getStorefront().then(setData).catch((e) => setError(e.message)); }, []);

  const search = (e) => { e.preventDefault(); navigate(`/browse?q=${encodeURIComponent(q.trim())}`); };

  return (
    <>
      <section className="hero">
        <h1>Buy, sell, exchange or bid on college essentials</h1>
        <p>EduSwap helps students reuse books, kits, calculators and lab gear instead of buying everything new.</p>
        <form className="hero-search" onSubmit={search}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search textbooks, calculators, drawing kits…" aria-label="Search" />
          <button className="btn btn-primary">Search</button>
        </form>
        <Link className="btn btn-outline" to={user ? '/listings/new' : '/register'}>{user ? '+ List an item' : 'Join EduSwap'}</Link>
      </section>

      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error && <p className="center-note">Loading…</p>}

      {data && (
        <>
          <h2 className="section-title">Shop by category</h2>
          <div className="tiles">
            {data.categories.map((c, i) => (
              <Link key={c.id} to={`/browse?category=${c.slug}`} className="tile" style={{ '--tile': TILE_COLORS[i % TILE_COLORS.length] }}>
                {c.coverImage && <img src={c.coverImage} alt="" loading="lazy" />}
                <span className="tile-label"><strong>{c.name}</strong><small>{c.itemCount} item{c.itemCount === 1 ? '' : 's'}</small></span>
              </Link>
            ))}
          </div>

          {data.endingSoon.length > 0 && (
            <section>
              <div className="section-head"><h2>🔨 Auctions ending soon</h2><Link to="/browse?type=auction&sort=ending_soon">View all →</Link></div>
              <div className="shelf">{data.endingSoon.map((i) => <ItemCard key={i.id} item={i} />)}</div>
            </section>
          )}

          {data.categories.filter((c) => c.items.length > 0).map((c) => (
            <section key={c.id}>
              <div className="section-head"><h2>{c.name}</h2><Link to={`/browse?category=${c.slug}`}>View all ({c.itemCount}) →</Link></div>
              <div className="shelf">{c.items.map((i) => <ItemCard key={i.id} item={i} />)}</div>
            </section>
          ))}

          {data.categories.every((c) => c.items.length === 0) && (
            <div className="card center"><p className="muted">No listings yet. Be the first to list an item!</p></div>
          )}

          <section className="how">
            <h2 className="section-title">How EduSwap works</h2>
            <div className="steps">
              <div className="card"><span className="step-no">1</span><h3>List it</h3><p className="muted">Add photos and choose: sell it, swap it, or auction it.</p></div>
              <div className="card"><span className="step-no">2</span><h3>Request or bid</h3><p className="muted">Buyers send purchase or exchange requests, or place bids on auctions.</p></div>
              <div className="card"><span className="step-no">3</span><h3>Meet on campus</h3><p className="muted">Accept a request, chat, and arrange the handover. Payment is between you two.</p></div>
              <div className="card"><span className="step-no">4</span><h3>Confirm and rate</h3><p className="muted">Both confirm the handover, then rate each other to build trust.</p></div>
            </div>
          </section>

          <section className="cta card center">
            <h2>Got something you no longer use?</h2>
            <Link className="btn btn-primary" to={user ? '/listings/new' : '/register'}>List an item</Link>
          </section>
        </>
      )}
    </>
  );
}
