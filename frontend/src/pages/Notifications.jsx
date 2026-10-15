import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotifications, readNotification, readAllNotifications } from '../services/flowService.js';
import { useNotifications } from '../context/NotificationContext.jsx';

const ICONS = { request_received: '📥', request_accepted: '✅', request_rejected: '❌', request_cancelled: '↩️', transaction_completed: '🎉', transaction_confirmed: '🤝', transaction_cancelled: '🚫', new_message: '✉️', review_received: '⭐', bid_received: '🔨', outbid: '⚠️', auction_won: '🏆', auction_ended: '⏱️', listing_removed: '🛑' };

function target(n) {
  switch (n.type) {
    case 'request_received': return '/requests?box=received';
    case 'request_rejected': return '/requests?box=sent';
    case 'request_cancelled': return '/requests?box=received';
    case 'request_accepted': case 'transaction_completed': case 'transaction_confirmed': case 'transaction_cancelled': case 'auction_won': return '/transactions';
    case 'new_message': return `/messages/${n.relatedId}`;
    case 'bid_received': case 'outbid': case 'auction_ended': return `/items/${n.relatedId}`;
    case 'review_received': return '/profile';
    case 'listing_removed': return '/my-listings';
    default: return null;
  }
}

export default function Notifications() {
  const navigate = useNavigate();
  const { refresh } = useNotifications();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => getNotifications().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const open = async (n) => {
    if (!n.isRead) { await readNotification(n.id).catch(() => {}); refresh(); }
    const to = target(n);
    if (to) navigate(to); else load();
  };
  const markAll = async () => { await readAllNotifications(); refresh(); load(); };

  return (
    <div className="narrow">
      <div className="page-head"><h2>Notifications</h2>{data?.unread > 0 && <button className="btn btn-outline btn-sm" onClick={markAll}>Mark all as read</button>}</div>
      {error && <div className="alert alert-error">{error}</div>}
      {!data ? <p className="center-note">Loading…</p> : data.notifications.length === 0 ? <div className="card center"><p className="muted">You're all caught up.</p></div> : (
        <div className="stack">
          {data.notifications.map((n) => (
            <button key={n.id} className={`card notif ${n.isRead ? '' : 'unread'}`} onClick={() => open(n)}>
              <span className="notif-icon">{ICONS[n.type] || '🔔'}</span>
              <span className="notif-text"><strong>{n.title}</strong>{n.body && <span className="muted small">{n.body}</span>}<small className="muted">{new Date(n.createdAt).toLocaleString('en-IN')}</small></span>
              {!n.isRead && <span className="dot" aria-label="Unread" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
