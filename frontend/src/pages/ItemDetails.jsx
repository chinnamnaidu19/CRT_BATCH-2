import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Countdown from '../components/Countdown.jsx';
import ReportButton from '../components/ReportButton.jsx';
import useLatest from '../hooks/useLatest.js';
import { getItem, getMyItems } from '../services/itemService.js';
import * as flow from '../services/flowService.js';
import { money, formatDate, CONDITION_LABELS, TYPE_LABELS } from '../utils/format.js';

export default function ItemDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const latest = useLatest();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [active, setActive] = useState(0);
  const [bids, setBids] = useState([]);
  const [panel, setPanel] = useState(null); // 'buy' | 'swap'
  const [note, setNote] = useState('');
  const [myItems, setMyItems] = useState([]);
  const [offered, setOffered] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const it = await latest(getItem(id));
      setItem(it); setError('');
      if (it.auction) flow.getBids(id).then(setBids).catch(() => {});
      const a = it.auction;
      if (a) setBidAmount(String(a.bidCount > 0 ? a.currentPrice + a.minIncrement : a.startingPrice));
    } catch (e) { setError(e.message); }
  }, [id]);

  useEffect(() => { setItem(null); setActive(0); setPanel(null); setMsg(null); load(); }, [load]);
  useEffect(() => {
    if (panel === 'swap') getMyItems().then((all) => setMyItems(all.filter((i) => i.status === 'available' && i.listingType !== 'auction' && i.id !== Number(id)))).catch(() => {});
  }, [panel, id]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!item) return <p className="center-note">Loading…</p>;

  const a = item.auction;
  const v = item.viewer;
  const isOwner = Boolean(v?.isOwner);
  const auctionLive = a && a.status === 'active' && new Date(a.endsAt) > new Date();
  const canAct = user && !isOwner && item.status === 'available';
  const run = async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg({ ok: true, text: okText || r.message }); await load(); return true; }
    catch (e) { setMsg({ ok: false, text: e.message }); await load(); return false; }
    finally { setBusy(false); }
  };

  const sendRequest = async (type) => {
    if (type === 'exchange' && !offered) return setMsg({ ok: false, text: 'Choose one of your items to offer' });
    const ok = await run(() => flow.createRequest({ itemId: item.id, type, offeredItemId: type === 'exchange' ? Number(offered) : undefined, message: note }),
      type === 'exchange' ? 'Exchange request sent. The owner has been notified.' : 'Purchase request sent. The owner has been notified.');
    if (ok) { setPanel(null); setNote(''); }
  };
  const toggleWish = () => run(() => (v.inWishlist ? flow.removeFromWishlist(item.id) : flow.addToWishlist(item.id)));
  const messageSeller = async () => {
    try { navigate(`/messages/${await flow.startConversation(item.owner.id, item.id)}`); } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  return (
    <div className="details">
      <div className="gallery">
        <div className="gallery-main"><img src={item.images[active]?.url} alt={item.title} /></div>
        {item.images.length > 1 && (
          <div className="gallery-thumbs">
            {item.images.map((img, i) => <button key={img.id} className={i === active ? 'on' : ''} onClick={() => setActive(i)}><img src={img.url} alt="" /></button>)}
          </div>
        )}
      </div>

      <div className="info card">
        <div className="chips">
          <span className={`badge type-${item.listingType}`}>{TYPE_LABELS[item.listingType]}</span>
          <span className="badge">{CONDITION_LABELS[item.condition]}</span>
          {item.status !== 'available' && <span className={`badge status-${item.status}`}>{item.status}</span>}
        </div>
        <h1>{item.title}</h1>
        <p className="muted">{item.category.name} · {item.college} · listed {formatDate(item.createdAt)}</p>

        {a ? (
          <div className="auction-panel">
            <div className="label">{a.bidCount > 0 ? 'Current bid' : 'Starting bid'}</div>
            <div className="big-price">{money(a.currentPrice)}</div>
            <div className="muted">{a.bidCount} bid{a.bidCount === 1 ? '' : 's'} · {auctionLive ? <><Countdown endsAt={a.endsAt} /> · ends {new Date(a.endsAt).toLocaleString('en-IN')}</> : <strong>Auction {a.status === 'cancelled' ? 'cancelled' : 'ended'}</strong>}</div>
            {v?.isHighestBidder && auctionLive && <div className="ok-text">✔ You are the highest bidder</div>}
          </div>
        ) : item.price !== null ? <div className="big-price">{money(item.price)}{item.listingType === 'both' && <small> or exchange</small>}</div>
                               : <div className="big-price exch">Open to exchange</div>}

        <h3>Description</h3>
        <p className="desc">{item.description}</p>

        <Link to={`/users/${item.owner.id}`} className="seller">
          <span className="avatar sm">{item.owner.profileImage ? <img src={item.owner.profileImage} alt="" /> : item.owner.fullName[0]}</span>
          <span><strong>{item.owner.fullName}</strong><br /><span className="muted small">{item.owner.department} · {item.owner.college}</span></span>
        </Link>

        {msg && <div className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`}>{msg.text}</div>}

        {!user && <p className="note"><Link to="/login">Log in</Link> or <Link to="/register">sign up</Link> to buy, exchange, bid or message the seller.</p>}

        {isOwner && (
          <div className="actions">
            {item.status === 'available' && <Link className="btn btn-primary" to={`/listings/${item.id}/edit`}>Edit listing</Link>}
            {item.status === 'reserved' && <Link className="btn btn-primary" to="/transactions">Go to transactions</Link>}
            <Link className="btn btn-outline" to="/my-listings">My listings</Link>
          </div>
        )}

        {user && !isOwner && item.status !== 'available' && <p className="note">This item is {item.status}, so it can't be requested right now.</p>}

        {canAct && a && auctionLive && !v.isHighestBidder && (
          <form className="bid-form" onSubmit={(e) => { e.preventDefault(); run(() => flow.placeBid(item.id, Number(bidAmount)), 'Bid placed. You are the highest bidder.'); }}>
            <label>Your bid (min {money(a.bidCount > 0 ? a.currentPrice + a.minIncrement : a.startingPrice)})
              <input type="number" step="0.01" min="1" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} required />
            </label>
            <button className="btn btn-primary" disabled={busy}>Place bid</button>
          </form>
        )}

        {canAct && !a && v.pendingRequest && <p className="note">You already sent a {v.pendingRequest.type} request for this item. <Link to="/requests">View your requests</Link></p>}

        {canAct && !a && !v.pendingRequest && (
          <>
            <div className="actions">
              {['sale', 'both'].includes(item.listingType) && <button className="btn btn-primary" onClick={() => setPanel(panel === 'buy' ? null : 'buy')}>Request to buy</button>}
              {['exchange', 'both'].includes(item.listingType) && <button className="btn btn-outline" onClick={() => setPanel(panel === 'swap' ? null : 'swap')}>Propose exchange</button>}
            </div>
            {panel && (
              <div className="request-panel">
                {panel === 'swap' && (
                  <label>Item you offer
                    <select value={offered} onChange={(e) => setOffered(e.target.value)}>
                      <option value="">Select one of your available items…</option>
                      {myItems.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
                    </select>
                    {myItems.length === 0 && <span className="muted small">You have no available items to offer. <Link to="/listings/new">List one first</Link>.</span>}
                  </label>
                )}
                <label>Message to the owner (optional)<textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hi! When can we meet on campus?" /></label>
                <button className="btn btn-primary" disabled={busy} onClick={() => sendRequest(panel === 'buy' ? 'purchase' : 'exchange')}>{panel === 'buy' ? 'Send purchase request' : 'Send exchange proposal'}</button>
                <p className="muted small">Payment and handover are arranged directly between students on campus.</p>
              </div>
            )}
          </>
        )}

        {user && !isOwner && (
          <div className="actions secondary">
            <button className="btn btn-outline btn-sm" onClick={toggleWish} disabled={busy}>{v.inWishlist ? '♥ Saved' : '♡ Save'}</button>
            <button className="btn btn-outline btn-sm" onClick={messageSeller}>✉ Message seller</button>
            <ReportButton itemId={item.id} />
          </div>
        )}

        {a && bids.length > 0 && (
          <>
            <h3>Bid history</h3>
            <ul className="bid-list">
              {bids.map((b) => <li key={b.id}><strong>{money(b.amount)}</strong> <span className="muted">{b.bidder} · {new Date(b.createdAt).toLocaleString('en-IN')}</span></li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
