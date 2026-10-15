import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Pagination from '../../components/Pagination.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import useLatest from '../../hooks/useLatest.js';
import { adminItems, adminRemoveItem, adminRestoreItem } from '../../services/flowService.js';
import { TYPE_LABELS } from '../../utils/format.js';

export default function AdminListings() {
  const [params] = useSearchParams();
  const latest = useLatest();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState(params.get('state') || '');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => latest(adminItems({ q: query, state, page, limit: 15 })).then(setData).catch((e) => setMsg({ ok: false, text: e.message })), [query, state, page]);
  useEffect(() => { load(); }, [load]);

  const remove = async (i) => {
    const reason = window.prompt(`Remove "${i.title}"? Optionally enter a reason for the seller:`, 'It violated the platform rules');
    if (reason === null) return;
    try { await adminRemoveItem(i.id, reason); setMsg({ ok: true, text: 'Listing removed. Pending requests and any live auction were cancelled.' }); } catch (e) { setMsg({ ok: false, text: e.message }); }
    load();
  };
  const restore = async (i) => { try { await adminRestoreItem(i.id); setMsg({ ok: true, text: 'Listing restored' }); } catch (e) { setMsg({ ok: false, text: e.message }); } load(); };

  return (
    <>
      <h2>Listing moderation</h2>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or seller" />
        <select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}><option value="">All</option><option value="active">Live (not removed)</option><option value="reported">Reported</option><option value="removed">Removed</option></select>
        <button className="btn btn-primary btn-sm">Search</button>
      </form>
      {msg && <div className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`}>{msg.text}</div>}
      {!data ? <p className="center-note">Loading…</p> : (
        <div className="table-wrap card">
          <table>
            <thead><tr><th /><th>Listing</th><th>Seller</th><th>Type</th><th>Status</th><th>Open reports</th><th /></tr></thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id} className={i.isRemoved ? 'removed' : ''}>
                  <td className="thumb-cell">{i.cover && <img src={i.cover} alt="" />}</td>
                  <td>{i.isRemoved ? i.title : <Link to={`/items/${i.id}`}>{i.title}</Link>}</td>
                  <td><Link to={`/users/${i.owner.id}`}>{i.owner.fullName}</Link></td>
                  <td>{TYPE_LABELS[i.listingType]}</td>
                  <td>{i.isRemoved ? <span className="badge st-cancelled">removed</span> : <StatusBadge status={i.status} />}</td>
                  <td>{i.openReports ? <strong className="err-text">{i.openReports}</strong> : '–'}</td>
                  <td>{i.isRemoved ? <button className="btn btn-outline btn-sm" onClick={() => restore(i)}>Restore</button> : <button className="btn btn-danger btn-sm" onClick={() => remove(i)}>Remove</button>}</td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={7} className="muted center">No listings found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  );
}
