import { useEffect, useState } from 'react';
import { adminStats } from '../../services/flowService.js';

function Bars({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="card">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="muted small">No data yet.</p> : rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-label">{String(r.label).replace('_', ' ')}</span>
          <span className="bar"><span style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <strong>{r.value}</strong>
        </div>
      ))}
    </section>
  );
}

export default function AdminStats() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { adminStats().then(setS).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!s) return <p className="center-note">Loading…</p>;
  return (
    <>
      <h2>Platform statistics</h2>
      <div className="stat-cards">
        {Object.entries({ 'Students': s.totals.students, 'Suspended': s.totals.suspendedStudents, 'Active listings': s.totals.activeListings, 'Live auctions': s.totals.liveAuctions, 'Completed deals': s.totals.completedTransactions, 'Open reports': s.totals.openReports }).map(([k, v]) => <div className="card stat" key={k}><strong>{v}</strong><span>{k}</span></div>)}
      </div>
      <div className="two-col">
        <Bars title="Listings by category" rows={s.byCategory} />
        <Bars title="Listings by type" rows={s.byListingType} />
        <Bars title="Requests by status" rows={s.requestsByStatus} />
        <Bars title="Transactions by status" rows={s.transactionsByStatus} />
        <Bars title="New students, last 14 days" rows={s.signupsLast14Days} />
      </div>
    </>
  );
}
