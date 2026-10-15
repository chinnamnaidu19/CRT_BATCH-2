import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminStats } from '../../services/flowService.js';

const CARDS = [
  ['students', 'Registered students', '/admin/users'],
  ['activeListings', 'Active listings', '/admin/listings?state=active'],
  ['completedTransactions', 'Completed transactions', '/admin/stats'],
  ['pendingRequests', 'Pending requests', '/admin/requests?status=pending'],
  ['reportedListings', 'Reported listings', '/admin/listings?state=reported'],
  ['liveAuctions', 'Live auctions', '/admin/listings'],
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { adminStats().then(setStats).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <h2>Admin dashboard</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {!stats ? !error && <p className="center-note">Loading…</p> : (
        <>
          <div className="stat-cards">
            {CARDS.map(([k, label, to]) => (
              <Link key={k} to={to} className={`card stat ${k === 'reportedListings' && stats.totals[k] > 0 ? 'alert-card' : ''}`}>
                <strong>{stats.totals[k]}</strong><span>{label}</span>
              </Link>
            ))}
          </div>
          {stats.totals.openReports > 0 && <div className="note"><Link to="/admin/reports">{stats.totals.openReports} open report{stats.totals.openReports > 1 ? 's' : ''} need review →</Link></div>}
        </>
      )}
    </>
  );
}
