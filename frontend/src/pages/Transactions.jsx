import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.jsx';
import StarRating from '../components/StarRating.jsx';
import { getTransactions, transactionAction, createReview, startConversation } from '../services/flowService.js';
import { money, formatDate } from '../utils/format.js';

function ReviewForm({ tx, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await createReview(tx.id, { rating, comment }); onDone('Thanks for your review!'); } catch (x) { setErr(x.message); }
  };
  return (
    <form className="review-form" onSubmit={submit}>
      <strong>Rate {tx.other.fullName}</strong>
      <StarRating value={rating} onChange={setRating} />
      <textarea rows={2} maxLength={1000} placeholder="Write a short review (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {err && <span className="err-text small">{err}</span>}
      <button className="btn btn-primary btn-sm">Submit review</button>
    </form>
  );
}

export default function Transactions() {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => getTransactions().then(setList).catch((e) => setMsg({ ok: false, text: e.message })), []);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    if (action === 'cancel' && !window.confirm('Cancel this transaction? The item(s) will become available again.')) return;
    try { const r = await transactionAction(id, action); setMsg({ ok: true, text: r.message }); } catch (e) { setMsg({ ok: false, text: e.message }); }
    load();
  };
  const chat = async (tx) => { try { navigate(`/messages/${await startConversation(tx.other.id, tx.item.id)}`); } catch (e) { setMsg({ ok: false, text: e.message }); } };

  return (
    <>
      <h2>Transaction history</h2>
      {msg && <div className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`}>{msg.text}</div>}
      {!list ? <p className="center-note">Loading…</p> : list.length === 0 ? <div className="card center"><p className="muted">No transactions yet. They appear when a request is accepted or you win an auction.</p></div> : (
        <div className="stack">
          {list.map((t) => (
            <article className="card req" key={t.id}>
              <div className="req-top">
                <span className={`badge type-${t.type === 'auction' ? 'auction' : t.type === 'exchange' ? 'exchange' : 'sale'}`}>{t.type}</span>
                <StatusBadge status={t.status} />
                <span className="muted small">{formatDate(t.createdAt)}{t.completedAt ? ` · completed ${formatDate(t.completedAt)}` : ''}</span>
              </div>
              <div className="req-items">
                <Link to={`/items/${t.item.id}`} className="mini"><span className="mini-img">{t.item.cover && <img src={t.item.cover} alt="" />}</span><span><strong>{t.item.title}</strong>{t.agreedPrice !== null && <><br /><span className="muted small">{money(t.agreedPrice)}</span></>}</span></Link>
                {t.offeredItem && <><span className="swap">⇄</span><Link to={`/items/${t.offeredItem.id}`} className="mini"><span className="mini-img">{t.offeredItem.cover && <img src={t.offeredItem.cover} alt="" />}</span><span><strong>{t.offeredItem.title}</strong></span></Link></>}
              </div>
              <p className="muted small">You are the <strong>{t.myRole}</strong> · with <Link to={`/users/${t.other.id}`}>{t.other.fullName}</Link></p>

              {t.status === 'in_progress' && (
                <>
                  <p className="note">Meet and hand over the item{t.type === 'exchange' ? 's' : ''}, then confirm below. It completes when <em>both</em> of you confirm.
                    {t.iConfirmed ? ' You have confirmed.' : ''}{t.otherConfirmed ? ` ${t.other.fullName} has confirmed.` : ''}</p>
                  <div className="actions">
                    {!t.iConfirmed && <button className="btn btn-primary btn-sm" onClick={() => act(t.id, 'confirm')}>Confirm handover</button>}
                    <button className="btn btn-outline btn-sm" onClick={() => chat(t)}>✉ Message</button>
                    <button className="btn btn-danger btn-sm" onClick={() => act(t.id, 'cancel')}>Cancel</button>
                  </div>
                </>
              )}
              {t.status === 'completed' && (t.canReview ? <ReviewForm tx={t} onDone={(text) => { setMsg({ ok: true, text }); load(); }} /> : <p className="ok-text small">✔ You reviewed this transaction.</p>)}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
