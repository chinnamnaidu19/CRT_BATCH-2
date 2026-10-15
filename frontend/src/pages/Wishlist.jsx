import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ItemCard from '../components/ItemCard.jsx';
import { getWishlist, removeFromWishlist } from '../services/flowService.js';

export default function Wishlist() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const load = () => getWishlist().then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const remove = async (id) => { await removeFromWishlist(id).catch(() => {}); load(); };

  return (
    <>
      <h2>My wishlist</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {!items ? <p className="center-note">Loading…</p> : items.length === 0 ? <div className="card center"><p className="muted">You haven't saved anything yet.</p><Link className="btn btn-primary" to="/browse">Browse items</Link></div> : (
        <div className="grid">{items.map((i) => <ItemCard key={i.id} item={i} actions={<button className="btn btn-outline btn-sm" onClick={() => remove(i.id)}>Remove</button>} />)}</div>
      )}
    </>
  );
}
