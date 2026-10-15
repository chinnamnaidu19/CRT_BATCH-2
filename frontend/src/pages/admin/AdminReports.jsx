import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Pagination from '../../components/Pagination.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import useLatest from '../../hooks/useLatest.js';
import { adminReports, adminResolveReport } from '../../services/flowService.js';
import { formatDate } from '../../utils/format.js';

export default function AdminReports() {
  const latest = useLatest();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => latest(adminReports({ status, page, limit: 10 })).then(setData).catch((e) => setMsg({ ok: false, text: e.message })), [status, page]);
  useEffect(() => { load(); }, [load]);

  const act = async (r, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try { await adminResolveReport(r.id, body); setMsg({ ok: true, text: 'Report updated' }); } catch (e) { setMsg({ ok: false, text: e.message }); }
    load();
  };

  return (
    <>
      <h2>Reports</h2>
      <div className="toolbar">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="open">Open</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="">All</option></select>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`}>{msg.text}</div>}
      {!data ? <p className="center-note">Loading…</p> : data.reports.length === 0 ? <div className="card center"><p className="muted">No reports here.</p></div> : (
        <div className="stack">
          {data.reports.map((r) => (
            <article className="card req" key={r.id}>
              <div className="req-top"><StatusBadge status={r.status} /><span className="badge">{r.reason.replace('_', ' ')}</span><span className="muted small">{formatDate(r.createdAt)} · reported by {r.reporter}</span></div>
              <p>{r.item ? <>Listing: {r.item.isRemoved ? <strong>{r.item.title} (removed)</strong> : <Link to={`/items/${r.item.id}`}>{r.item.title}</Link>}</> : <>Student: <Link to={`/users/${r.user.id}`}>{r.user.fullName}</Link></>}</p>
              {r.details && <p className="quote">“{r.details}”</p>}
              {r.status === 'open' && (
                <div className="actions">
                  {r.item && !r.item.isRemoved && <button className="btn btn-danger btn-sm" onClick={() => act(r, { status: 'resolved', removeListing: true }, 'Remove this listing and resolve the report?')}>Remove listing</button>}
                  <button className="btn btn-outline btn-sm" onClick={() => act(r, { status: 'resolved' })}>Mark resolved</button>
                  <button className="btn btn-outline btn-sm" onClick={() => act(r, { status: 'dismissed' })}>Dismiss</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  );
}
