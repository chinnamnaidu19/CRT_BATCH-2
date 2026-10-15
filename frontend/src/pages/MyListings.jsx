import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ItemCard from '../components/ItemCard.jsx';
import { getMyItems, deleteItem } from '../services/itemService.js';
import { cancelAuction, relistAuction } from '../services/flowService.js';

export default function MyListings() {
  const [items, setItems] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = () => getMyItems().then(setItems).catch((e) => setMsg({ type: 'error', text: e.message }));
  useEffect(() => { load(); }, []);

  const run = async (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try { const r = await fn(); setMsg({ type: 'success', text: r.message }); } catch (e) { setMsg({ type: 'error', text: e.message }); }
    load();
  };

  return (
    <>
      <div className="page-head">
        <h2>My listings</h2>
        <Link className="btn btn-primary" to="/listings/new">+ New listing</Link>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {!items ? <p className="center-note">Loading…</p> : items.length === 0 ? (
        <div className="card center"><p className="muted">You haven't listed anything yet.</p><Link className="btn btn-primary" to="/listings/new">List your first item</Link></div>
      ) : (
        <div className="grid">
          {items.map((item) => {
            const a = item.auction;
            const live = a && a.status === 'active' && new Date(a.endsAt) > new Date();
            const bidsLive = live && a.bidCount > 0;
            const relistable = a && !live && a.bidCount === 0 && item.status === 'available';
            const editable = item.status === 'available';
            return (
              <ItemCard key={item.id} item={item} actions={
                <>
                  {editable ? <Link className="btn btn-outline btn-sm" to={`/listings/${item.id}/edit`}>Edit</Link> : item.status === 'reserved' ? <Link className="btn btn-outline btn-sm" to="/transactions">Deal</Link> : <span className="muted small">Locked</span>}
                  {live && <button className="btn btn-outline btn-sm" onClick={() => run(() => cancelAuction(item.id), 'Cancel this auction? All bidders will be notified.')}>Cancel auction</button>}
                  {relistable && <button className="btn btn-primary btn-sm" onClick={() => run(() => relistAuction(item.id, 72))}>Relist 3 days</button>}
                  {editable && <button className="btn btn-danger btn-sm" disabled={bidsLive} title={bidsLive ? 'Cancel the auction first' : ''} onClick={() => run(() => deleteItem(item.id), `Delete "${item.title}"? This cannot be undone.`)}>Delete</button>}
                </>
              } />
            );
          })}
        </div>
      )}
    </>
  );
}
