import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getRequests, getTransactions, getWishlist } from '../services/flowService.js';
import { getMyItems } from '../services/itemService.js';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const { unread } = useNotifications();
  const [s, setS] = useState(null);

  useEffect(() => {
    Promise.all([getMyItems(), getRequests('received', 'pending'), getTransactions(), getWishlist()])
      .then(([items, pending, tx, wish]) => setS({
        active: items.filter((i) => i.status === 'available').length,
        pending: pending.length,
        inProgress: tx.filter((t) => t.status === 'in_progress').length,
        completed: tx.filter((t) => t.status === 'completed').length,
        wish: wish.length,
      })).catch(() => setS(null));
  }, []);

  const cards = s ? [
    ['/my-listings', s.active, 'Active listings'],
    ['/requests?box=received', s.pending, 'Requests to review'],
    ['/transactions', s.inProgress, 'Deals in progress'],
    ['/transactions', s.completed, 'Completed deals'],
    ['/notifications', unread, 'Unread notifications'],
    ['/wishlist', s.wish, 'Saved items'],
  ] : [];

  return (
    <>
      <section className="card">
        <h2>Hi, {user.fullName}</h2>
        <p className="muted">{user.department} · Year {user.academicYear} · {user.college}</p>
        <div className="actions"><Link className="btn btn-primary" to="/listings/new">+ List an item</Link><Link className="btn btn-outline" to="/browse">Browse items</Link></div>
      </section>
      <div className="stat-cards">
        {cards.map(([to, n, label]) => <Link key={label} to={to} className={`card stat ${n > 0 && ['Requests to review', 'Unread notifications'].includes(label) ? 'alert-card' : ''}`}><strong>{n}</strong><span>{label}</span></Link>)}
      </div>
    </>
  );
}
