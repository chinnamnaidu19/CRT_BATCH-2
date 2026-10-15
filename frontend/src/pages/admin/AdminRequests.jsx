import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Pagination from '../../components/Pagination.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import useLatest from '../../hooks/useLatest.js';
import { adminRequests } from '../../services/flowService.js';
import { formatDate } from '../../utils/format.js';

export default function AdminRequests() {
  const [params] = useSearchParams();
  const latest = useLatest();
  const [status, setStatus] = useState(params.get('status') || '');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { latest(adminRequests({ status, page, limit: 15 })).then(setData).catch((e) => setError(e.message)); }, [status, page]);

  return (
    <>
      <h2>Purchase & exchange requests</h2>
      <div className="toolbar">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['pending', 'accepted', 'rejected', 'cancelled', 'completed'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!data ? !error && <p className="center-note">Loading…</p> : (
        <div className="table-wrap card">
          <table>
            <thead><tr><th>#</th><th>Type</th><th>Requested item</th><th>Offered item</th><th>From</th><th>To</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {data.requests.map((r) => (
                <tr key={r.id}><td>{r.id}</td><td>{r.type}</td><td>{r.requestedTitle}</td><td>{r.offeredTitle || '–'}</td><td>{r.requester}</td><td>{r.owner}</td><td>{formatDate(r.createdAt)}</td><td><StatusBadge status={r.status} /></td></tr>
              ))}
              {data.requests.length === 0 && <tr><td colSpan={8} className="muted center">No requests.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  );
}
