import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.jsx';
import useLatest from '../hooks/useLatest.js';
import { getRequests, requestAction } from '../services/flowService.js';
import { money, formatDate } from '../utils/format.js';

function Mini({ item, label }) {
  return (
    <Link to={`/items/${item.id}`} className="mini">
      <span className="mini-img">{item.cover ? <img src={item.cover} alt="" /> : null}</span>
      <span><small className="muted">{label}</small><br /><strong>{item.title}</strong>{item.price !== null && item.price !== undefined && <><br /><span className="muted small">{money(item.price)}</span></>}</span>
    </Link>
  );
}

export default function Requests() {
  const [params, setParams] = useSearchParams();
  const latest = useLatest();
  const box = params.get('box') === 'sent' ? 'sent' : 'received';
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => latest(getRequests(box)).then(setList).catch((e) => setMsg({ ok: false, text: e.message })), [box]);
  useEffect(() => { setList(null); load(); }, [load]);

  const act = async (id, action) => {
    if (action === 'reject' && !window.confirm('Reject this request?')) return;
    try { const r = await requestAction(id, action); setMsg({ ok: true, text: r.message }); } catch (e) { setMsg({ ok: false, text: e.message }); }
    load();
  };

  return (
    <>
      <h2>Purchase & exchange requests</h2>
      <div className="tabs">
        <button className={box === 'received' ? 'on' : ''} onClick={() => setParams({ box: 'received' })}>Received</button>
        <button className={box === 'sent' ? 'on' : ''} onClick={() => setParams({ box: 'sent' })}>Sent</button>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`}>{msg.text}</div>}
      {!list ? <p className="center-note">Loading…</p> : list.length === 0 ? <div className="card center"><p className="muted">No {box} requests.</p></div> : (
        <div className="stack">
          {list.map((r) => (
            <article className="card req" key={r.id}>
              <div className="req-top">
                <span className={`badge type-${r.type === 'exchange' ? 'exchange' : 'sale'}`}>{r.type === 'exchange' ? 'Exchange' : 'Purchase'}</span>
                <StatusBadge status={r.status} />
                <span className="muted small">{formatDate(r.createdAt)} · {box === 'received' ? `from ${r.requester.fullName}` : `to ${r.owner.fullName}`}</span>
              </div>
              <div className="req-items">
                <Mini item={r.requestedItem} label={box === 'received' ? 'Your item' : 'Requested item'} />
                {r.offeredItem && <><span className="swap">⇄</span><Mini item={r.offeredItem} label={box === 'received' ? 'They offer' : 'You offer'} /></>}
              </div>
              {r.message && <p className="quote">“{r.message}”</p>}
              <div className="actions">
                {box === 'received' && r.status === 'pending' && <><button className="btn btn-primary btn-sm" onClick={() => act(r.id, 'accept')}>Accept</button><button className="btn btn-danger btn-sm" onClick={() => act(r.id, 'reject')}>Reject</button></>}
                {box === 'sent' && r.status === 'pending' && <button className="btn btn-outline btn-sm" onClick={() => act(r.id, 'cancel')}>Cancel request</button>}
                {r.transactionId && ['accepted', 'completed'].includes(r.status) && <Link className="btn btn-outline btn-sm" to="/transactions">View transaction</Link>}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
