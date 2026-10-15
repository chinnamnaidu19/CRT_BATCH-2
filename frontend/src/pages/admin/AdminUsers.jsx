import { useCallback, useEffect, useState } from 'react';
import Pagination from '../../components/Pagination.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import useLatest from '../../hooks/useLatest.js';
import { adminUsers, adminSetUserStatus } from '../../services/flowService.js';
import { formatDate } from '../../utils/format.js';

export default function AdminUsers() {
  const latest = useLatest();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => latest(adminUsers({ q: query, status, page, limit: 15 })).then(setData).catch((e) => setMsg({ ok: false, text: e.message })), [query, status, page]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (u) => {
    const next = u.status === 'active' ? 'suspended' : 'active';
    if (!window.confirm(`${next === 'suspended' ? 'Suspend' : 'Reactivate'} ${u.fullName}?`)) return;
    try { await adminSetUserStatus(u.id, next); setMsg({ ok: true, text: `${u.fullName} is now ${next}` }); } catch (e) { setMsg({ ok: false, text: e.message }); }
    load();
  };

  return (
    <>
      <h2>Students</h2>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or college" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
        <button className="btn btn-primary btn-sm">Search</button>
      </form>
      {msg && <div className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`}>{msg.text}</div>}
      {!data ? <p className="center-note">Loading…</p> : (
        <div className="table-wrap card">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>College</th><th>Listings</th><th>Reports</th><th>Joined</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName}{u.role === 'admin' && <span className="badge"> admin</span>}</td><td>{u.email}</td><td>{u.college}</td>
                  <td>{u.listingCount}</td><td>{u.openReports || '–'}</td><td>{formatDate(u.createdAt)}</td><td><StatusBadge status={u.status} /></td>
                  <td>{u.role !== 'admin' && <button className={`btn btn-sm ${u.status === 'active' ? 'btn-danger' : 'btn-outline'}`} onClick={() => toggle(u)}>{u.status === 'active' ? 'Suspend' : 'Reactivate'}</button>}</td>
                </tr>
              ))}
              {data.users.length === 0 && <tr><td colSpan={8} className="muted center">No students found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  );
}
