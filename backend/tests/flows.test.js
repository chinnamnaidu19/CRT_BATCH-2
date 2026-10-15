// Integration tests for Phases 4-8 (browse, requests, bidding, transactions, reviews,
// notifications, messaging, reports, admin). Needs the API running and the DB seeded:
//   npm run dev     (one terminal)      npm test     (another)
import 'dotenv/config';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/db.js';
import { solidPng } from '../utils/placeholderPng.js';

const BASE = process.env.API_URL || 'http://localhost:5000/api';
const run = Date.now();
const TOKEN = `tok${run}`; // unique word so browse tests only see this run's listings

function client() {
  let cookie = '';
  const c = async (path, opts = {}) => {
    const res = await fetch(BASE + path, { ...opts, headers: { ...(opts.headers || {}), cookie } });
    const set = res.headers.getSetCookie?.() || [];
    if (set.length) cookie = set.map((x) => x.split(';')[0]).join('; ');
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };
  return c;
}
const jopts = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const png = () => new Blob([solidPng(40, 50, 60)], { type: 'image/png' });

async function register(name) {
  const c = client();
  const r = await c('/auth/register', jopts('POST', { fullName: `${name} Tester`, email: `${name}${run}@test.com`, college: 'Flow College', department: 'CSE', academicYear: 2, password: 'Passw0rdX', confirmPassword: 'Passw0rdX' }));
  assert.equal(r.status, 201, r.text);
  c.user = r.json.user;
  return c;
}
async function makeItem(c, f = {}) {
  const base = { title: `${TOKEN} item`, description: 'A listing created by the test suite.', categoryId: 8, listingType: 'sale', condition: 'good', price: 100 };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...f })) if (v !== undefined) fd.append(k, String(v));
  fd.append('images', png(), 'x.png');
  const r = await c('/items', { method: 'POST', body: fd });
  assert.equal(r.status, 201, r.text);
  return r.json.item;
}
const makeAuction = (c, f = {}) => makeItem(c, { listingType: 'auction', price: undefined, startingPrice: 100, minIncrement: 10, durationHours: 24, ...f });
const request = (c, itemId, type = 'purchase', extra = {}) => c('/requests', jopts('POST', { itemId, type, ...extra }));
const endAuctionNow = (itemId) => pool.query("UPDATE auctions SET starts_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR), ends_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE item_id = ?", [itemId]);
const notifTypes = async (c) => (await c('/notifications')).json.notifications.map((n) => n.type);

let carol, dave, erin, frank, admin;
const bidders = [];

after(() => pool.end());

test('setup: register users and log in the seeded admin', async () => {
  [carol, dave, erin, frank] = await Promise.all(['carol', 'dave', 'erin', 'frank'].map(register));
  for (let i = 0; i < 4; i++) bidders.push(await register(`bidder${i}`));
  admin = client();
  const r = await admin('/auth/login', jopts('POST', { email: process.env.SEED_ADMIN_EMAIL || 'admin@eduswap.local', password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123' }));
  assert.equal(r.status, 200, 'seeded admin must exist (run npm run seed)');
  assert.equal(r.json.user.role, 'admin');
});

// ------------------------------------------------------------------ Phase 4: storefront and browse
test('storefront: 8 categories, newest item shown in its category, auctions in ending-soon', async () => {
  const item = await makeItem(carol, { title: `${TOKEN} storefront item`, categoryId: 8 });
  const auction = await makeAuction(carol, { title: `${TOKEN} storefront auction`, categoryId: 8, durationHours: 1 });
  const r = await client()('/storefront');
  assert.equal(r.status, 200);
  assert.equal(r.json.categories.length, 8);
  const other = r.json.categories.find((c) => c.id === 8);
  assert.ok(other.items.length <= 8);
  assert.ok(other.items.some((i) => i.id === item.id));
  assert.ok(other.itemCount >= 2);
  assert.ok(r.json.endingSoon.some((i) => i.id === auction.id));
  assert.ok(r.json.recent.length > 0);
});

test('browse: keyword search, wildcard characters are literal, filters, sort, pagination', async () => {
  const a = await makeItem(carol, { title: `${TOKEN} alpha`, price: 100, categoryId: 3, condition: 'like_new' });
  const b = await makeItem(carol, { title: `${TOKEN} beta`, price: 300, categoryId: 3, condition: 'good' });
  const c3 = await makeItem(carol, { title: `${TOKEN} gamma 50% off`, price: 200, categoryId: 4, condition: 'good' });
  const anon = client();

  const all = await anon(`/items?q=${TOKEN}&sort=price_asc`);
  assert.deepEqual(all.json.items.filter((i) => [a.id, b.id, c3.id].includes(i.id)).map((i) => i.price), [100, 200, 300]);
  assert.equal((await anon(`/items?q=${TOKEN}+alpha`)).json.total, 1, 'all keywords must match');
  const pct = await anon('/items?q=%25&limit=48');
  assert.ok(pct.json.items.every((i) => /%/.test(i.title + i.description)), '% must not act as a wildcard');
  assert.equal((await anon(`/items?q=${TOKEN}&category=3`)).json.total, 2);
  assert.equal((await anon(`/items?q=${TOKEN}&condition=like_new`)).json.items[0].id, a.id);
  assert.equal((await anon(`/items?q=${TOKEN}&minPrice=150&maxPrice=250`)).json.items[0].id, c3.id);
  const desc = await anon(`/items?q=${TOKEN}&sort=price_desc&limit=2`);
  assert.equal(desc.json.items[0].price, 300);
  const p2 = await anon(`/items?q=${TOKEN}&sort=price_asc&limit=2&page=2`);
  assert.ok(p2.json.totalPages >= 2 && p2.json.page === 2 && p2.json.items.length >= 1);
  assert.equal((await anon('/items?sort=hack')).status, 400);
  assert.equal((await anon('/items?minPrice=abc')).status, 400);
  const sqli = await anon("/items?q=' OR 1=1 --");
  assert.equal(sqli.status, 200);
  assert.equal(sqli.json.total, 0);
});

test('browse: type filter and hidden/ended items', async () => {
  const sale = await makeItem(carol, { title: `${TOKEN} typesale`, listingType: 'sale', price: 10 });
  const exch = await makeItem(carol, { title: `${TOKEN} typeexch`, listingType: 'exchange', price: undefined });
  const auc = await makeAuction(carol, { title: `${TOKEN} typeauc` });
  const anon = client();
  const ids = async (qs) => (await anon(`/items?q=${TOKEN}+type${qs}&limit=48`)).json.items.map((i) => i.id);
  assert.deepEqual((await ids('&type=auction')), [auc.id]);
  assert.ok((await ids('&type=sale')).includes(sale.id));
  assert.ok((await ids('&type=exchange')).includes(exch.id));
  await endAuctionNow(auc.id);
  assert.ok(!(await ids('')).includes(auc.id), 'a finished auction must disappear from browse');
});

test('wishlist: add, flag on item, list, remove, own item refused', async () => {
  const item = await makeItem(carol);
  assert.equal((await dave('/wishlist/' + item.id, { method: 'POST' })).status, 201);
  assert.equal((await dave(`/items/${item.id}`)).json.item.viewer.inWishlist, true);
  assert.ok((await dave('/wishlist')).json.items.some((i) => i.id === item.id));
  assert.equal((await carol('/wishlist/' + item.id, { method: 'POST' })).status, 400);
  assert.equal((await dave('/wishlist/' + item.id, { method: 'DELETE' })).status, 200);
  assert.equal((await dave(`/items/${item.id}`)).json.item.viewer.inWishlist, false);
  assert.equal((await client()('/wishlist')).status, 401);
});

// ------------------------------------------------------------------ Phase 5: requests
test('request validation rules', async () => {
  const sale = await makeItem(carol, { listingType: 'sale' });
  const exchOnly = await makeItem(carol, { listingType: 'exchange', price: undefined });
  const auc = await makeAuction(carol);
  const daveItem = await makeItem(dave, { listingType: 'exchange', price: undefined });
  const erinItem = await makeItem(erin, { listingType: 'exchange', price: undefined });

  assert.equal((await request(carol, sale.id)).status, 400, 'own listing');
  assert.equal((await request(dave, exchOnly.id, 'purchase')).status, 400, 'purchase of exchange-only');
  assert.equal((await request(dave, sale.id, 'exchange', { offeredItemId: daveItem.id })).status, 400, 'exchange on sale-only');
  assert.equal((await request(dave, auc.id)).status, 400, 'auction needs bidding');
  assert.equal((await request(dave, exchOnly.id, 'exchange')).status, 400, 'exchange needs offered item');
  assert.equal((await request(dave, exchOnly.id, 'exchange', { offeredItemId: erinItem.id })).status, 400, "someone else's item");
  assert.equal((await request(dave, sale.id, 'purchase', { offeredItemId: daveItem.id })).status, 400, 'purchase with offered item');
  assert.equal((await request(dave, 999999)).status, 404);
  assert.equal((await request(client(), sale.id)).status, 401);

  const ok = await request(dave, sale.id, 'purchase', { message: 'Hi!' });
  assert.equal(ok.status, 201, ok.text);
  assert.equal((await request(dave, sale.id)).status, 409, 'duplicate pending request');
  assert.equal((await erin(`/requests/${ok.json.request.id}/cancel`, { method: 'PATCH' })).status, 403);
  assert.equal((await dave(`/requests/${ok.json.request.id}/cancel`, { method: 'PATCH' })).status, 200);
  assert.equal((await dave(`/requests/${ok.json.request.id}/cancel`, { method: 'PATCH' })).status, 409, 'only pending can be cancelled');
  assert.ok((await notifTypes(carol)).includes('request_cancelled'));
});

let purchase; // shared between the next tests
test('accepting a request reserves the item, creates a transaction and rejects competing requests', async () => {
  const item = await makeItem(carol, { price: 250 });
  const rDave = (await request(dave, item.id)).json.request;
  const rErin = (await request(erin, item.id)).json.request;
  assert.ok((await notifTypes(carol)).includes('request_received'));
  assert.equal((await erin(`/requests/${rDave.id}/accept`, { method: 'PATCH' })).status, 403, 'non-owner');

  const acc = await carol(`/requests/${rDave.id}/accept`, { method: 'PATCH' });
  assert.equal(acc.status, 200, acc.text);
  assert.equal((await client()(`/items/${item.id}`)).json.item.status, 'reserved');
  const erinReqs = (await erin('/requests?box=sent')).json.requests;
  assert.equal(erinReqs.find((r) => r.id === rErin.id).status, 'rejected');
  assert.ok((await notifTypes(erin)).includes('request_rejected'));
  assert.ok((await notifTypes(dave)).includes('request_accepted'));
  assert.equal((await carol(`/requests/${rErin.id}/accept`, { method: 'PATCH' })).status, 409);
  assert.equal((await carol(`/requests/${rDave.id}/accept`, { method: 'PATCH' })).status, 409, 'cannot accept twice');
  assert.equal((await request(frank, item.id)).status, 409, 'reserved items take no new requests');

  const tx = (await dave('/transactions')).json.transactions.find((t) => t.item.id === item.id);
  assert.equal(tx.status, 'in_progress');
  assert.equal(tx.agreedPrice, 250);
  assert.equal(tx.type, 'purchase');
  purchase = { item, tx };
});

test('two owners accepting competing requests at the same moment: exactly one wins', async () => {
  const item = await makeItem(carol, { price: 80 });
  const rDave = (await request(dave, item.id)).json.request;
  const rErin = (await request(erin, item.id)).json.request;
  const [a, b] = await Promise.all([
    carol(`/requests/${rDave.id}/accept`, { method: 'PATCH' }),
    carol(`/requests/${rErin.id}/accept`, { method: 'PATCH' }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM transactions WHERE item_id = ?", [item.id]);
  assert.equal(n, 1, 'exactly one transaction for the item');
});

test('reject by owner works and notifies the requester', async () => {
  const item = await makeItem(carol);
  const r = (await request(frank, item.id)).json.request;
  assert.equal((await carol(`/requests/${r.id}/reject`, { method: 'PATCH' })).status, 200);
  assert.equal((await carol(`/requests/${r.id}/reject`, { method: 'PATCH' })).status, 409);
  assert.ok((await notifTypes(frank)).includes('request_rejected'));
});

// ------------------------------------------------------------------ Phase 6: transactions + reviews
test('transaction completes only after both confirm; items become sold; no re-request afterwards', async () => {
  const { item, tx } = purchase;
  assert.equal((await erin(`/transactions/${tx.id}/confirm`, { method: 'PATCH' })).status, 404, 'non-participant');
  assert.equal((await erin(`/transactions/${tx.id}`)).status, 404);
  const r1 = await dave(`/transactions/${tx.id}/confirm`, { method: 'PATCH' });
  assert.equal(r1.json.completed, false);
  assert.equal((await dave(`/transactions/${tx.id}/confirm`, { method: 'PATCH' })).status, 409, 'same person twice');
  assert.equal((await client()(`/items/${item.id}`)).json.item.status, 'reserved', 'still reserved after one confirmation');
  assert.equal((await dave(`/transactions/${tx.id}/reviews`, jopts('POST', { rating: 5 }))).status, 409, 'cannot review before completion');
  assert.ok((await notifTypes(carol)).includes('transaction_confirmed'));

  const r2 = await carol(`/transactions/${tx.id}/confirm`, { method: 'PATCH' });
  assert.equal(r2.json.completed, true);
  assert.equal((await client()(`/items/${item.id}`)).json.item.status, 'sold');
  assert.equal((await dave(`/transactions/${tx.id}`)).json.transaction.status, 'completed');
  assert.equal((await carol(`/transactions/${tx.id}/confirm`, { method: 'PATCH' })).status, 409);
  assert.equal((await carol(`/transactions/${tx.id}/cancel`, { method: 'PATCH' })).status, 409);
  assert.equal((await request(frank, item.id)).status, 409, 'a sold item cannot be requested again');
  assert.equal((await carol(`/items/${item.id}`, { method: 'DELETE' })).status, 409, 'sold item cannot be deleted');
  assert.ok((await notifTypes(dave)).includes('transaction_completed'));
});

test('reviews: eligibility, rating bounds, duplicates, profile average', async () => {
  const { tx } = purchase;
  assert.equal((await dave(`/transactions/${tx.id}/reviews`, jopts('POST', { rating: 6 }))).status, 400);
  assert.equal((await dave(`/transactions/${tx.id}/reviews`, jopts('POST', { rating: 0 }))).status, 400);
  assert.equal((await erin(`/transactions/${tx.id}/reviews`, jopts('POST', { rating: 5 }))).status, 404, 'outsider');
  assert.equal((await dave(`/transactions/${tx.id}/reviews`, jopts('POST', { rating: 4, comment: 'Smooth handover' }))).status, 201);
  assert.equal((await dave(`/transactions/${tx.id}/reviews`, jopts('POST', { rating: 1 }))).status, 409, 'duplicate');
  assert.equal((await carol(`/transactions/${tx.id}/reviews`, jopts('POST', { rating: 5 }))).status, 201, 'the other side may review too');
  const mine = (await dave('/transactions')).json.transactions.find((t) => t.id === tx.id);
  assert.equal(mine.hasReviewed, true);
  assert.equal(mine.canReview, false);
  const prof = (await client()(`/users/${carol.user.id}`)).json.profile;
  assert.equal(prof.rating.average, 4);
  assert.equal(prof.rating.count, 1);
  assert.equal(prof.reviews[0].comment, 'Smooth handover');
  assert.ok(prof.completedTransactions >= 1);
  assert.ok((await notifTypes(carol)).includes('review_received'));
});

test('exchange: offered item reserved on accept, both become exchanged on completion', async () => {
  const wanted = await makeItem(carol, { listingType: 'both', price: 90 });
  const offered = await makeItem(erin, { listingType: 'exchange', price: undefined });
  const r = await request(erin, wanted.id, 'exchange', { offeredItemId: offered.id, message: 'Swap?' });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.request.offeredItem.id, offered.id);
  // a competing purchase request on the wanted item must be rejected when the exchange is accepted
  const competing = (await request(dave, wanted.id)).json.request;
  const acc = await carol(`/requests/${r.json.request.id}/accept`, { method: 'PATCH' });
  assert.equal(acc.status, 200, acc.text);
  assert.equal((await client()(`/items/${offered.id}`)).json.item.status, 'reserved');
  assert.equal((await dave('/requests?box=sent')).json.requests.find((x) => x.id === competing.id).status, 'rejected');
  const txId = acc.json.transactionId;
  await erin(`/transactions/${txId}/confirm`, { method: 'PATCH' });
  await carol(`/transactions/${txId}/confirm`, { method: 'PATCH' });
  assert.equal((await client()(`/items/${wanted.id}`)).json.item.status, 'exchanged');
  assert.equal((await client()(`/items/${offered.id}`)).json.item.status, 'exchanged');
  assert.equal((await erin(`/requests?box=sent&status=completed`)).json.requests.length, 1);
});

test('cancelling an in-progress transaction frees the items again', async () => {
  const item = await makeItem(carol);
  const r = (await request(dave, item.id)).json.request;
  const { transactionId } = (await carol(`/requests/${r.id}/accept`, { method: 'PATCH' })).json;
  assert.equal((await erin(`/transactions/${transactionId}/cancel`, { method: 'PATCH' })).status, 404);
  assert.equal((await dave(`/transactions/${transactionId}/cancel`, { method: 'PATCH' })).status, 200);
  assert.equal((await client()(`/items/${item.id}`)).json.item.status, 'available');
  assert.equal((await carol('/requests?box=received&status=cancelled')).json.requests.some((x) => x.id === r.id), true);
  assert.ok((await notifTypes(carol)).includes('transaction_cancelled'));
  assert.equal((await request(frank, item.id)).status, 201, 'available again');
});

// ------------------------------------------------------------------ Phase 5: auctions
test('bidding rules: minimums, own item, same bidder, outbid notification', async () => {
  const auc = await makeAuction(carol, { startingPrice: 100, minIncrement: 10 });
  const bid = (c, amount) => c(`/items/${auc.id}/bids`, jopts('POST', { amount }));
  assert.equal((await bid(carol, 150)).status, 403, 'seller cannot bid');
  assert.equal((await bid(client(), 150)).status, 401);
  assert.equal((await bid(dave, 99)).status, 400, 'below starting price');
  assert.equal((await bid(dave, -5)).status, 400);
  assert.equal((await bid(dave, 100)).status, 201, 'first bid may equal the starting price');
  assert.equal((await bid(dave, 200)).status, 409, 'already highest bidder');
  assert.equal((await bid(erin, 105)).status, 400, 'must beat current by the increment');
  assert.equal((await bid(erin, 110)).status, 201);
  assert.ok((await notifTypes(dave)).includes('outbid'));
  assert.ok((await notifTypes(carol)).includes('bid_received'));

  const view = (await dave(`/items/${auc.id}`)).json.item;
  assert.equal(view.auction.currentPrice, 110);
  assert.equal(view.auction.bidCount, 2);
  assert.equal(view.viewer.isHighestBidder, false);
  assert.equal((await erin(`/items/${auc.id}`)).json.item.viewer.isHighestBidder, true);
  const bids = (await client()(`/items/${auc.id}/bids`)).json.bids;
  assert.equal(bids[0].amount, 110);
  assert.doesNotMatch(JSON.stringify(bids), /@test\.com/);
  assert.equal((await erin(`/items/${auc.id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await carol(`/items/${auc.id}`, { method: 'DELETE' })).status, 409, 'cannot delete an auction with bids');
});

test('five simultaneous identical bids: exactly one is accepted', async () => {
  const auc = await makeAuction(carol, { startingPrice: 100, minIncrement: 10 });
  const results = await Promise.all([dave, erin, frank, bidders[0], bidders[1]].map((c) => c(`/items/${auc.id}/bids`, jopts('POST', { amount: 100 }))));
  assert.equal(results.filter((r) => r.status === 201).length, 1, results.map((r) => r.status).join());
  const a = (await client()(`/items/${auc.id}`)).json.item.auction;
  assert.equal(a.bidCount, 1);
  assert.equal(a.currentPrice, 100);
});

test('anti-sniping: a bid in the last two minutes extends the auction', async () => {
  const auc = await makeAuction(carol);
  await pool.query("UPDATE auctions SET ends_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 SECOND) WHERE item_id = ?", [auc.id]);
  assert.equal((await dave(`/items/${auc.id}/bids`, jopts('POST', { amount: 100 }))).status, 201);
  const ends = new Date((await client()(`/items/${auc.id}`)).json.item.auction.endsAt);
  assert.ok(ends - Date.now() > 100 * 1000, 'end time should be pushed to about two minutes from now');
});

test('auction end: winner gets a transaction, bidding closes, both confirm -> sold', async () => {
  const auc = await makeAuction(carol, { startingPrice: 100, minIncrement: 10 });
  await dave(`/items/${auc.id}/bids`, jopts('POST', { amount: 100 }));
  await frank(`/items/${auc.id}/bids`, jopts('POST', { amount: 150 }));
  await endAuctionNow(auc.id);

  const view = (await client()(`/items/${auc.id}`)).json.item; // viewing closes it lazily
  assert.equal(view.auction.status, 'ended');
  assert.equal(view.status, 'reserved');
  assert.equal((await erin(`/items/${auc.id}/bids`, jopts('POST', { amount: 500 }))).status, 409, 'late bid refused');

  const tx = (await frank('/transactions')).json.transactions.find((t) => t.item.id === auc.id);
  assert.equal(tx.type, 'auction');
  assert.equal(tx.agreedPrice, 150);
  assert.equal(tx.myRole, 'buyer');
  assert.ok((await notifTypes(frank)).includes('auction_won'));
  assert.ok((await notifTypes(dave)).includes('auction_ended'), 'losing bidder is told');
  assert.ok((await notifTypes(carol)).includes('auction_ended'));
  assert.equal((await dave('/transactions')).json.transactions.some((t) => t.item.id === auc.id), false, 'loser has no transaction');

  await frank(`/transactions/${tx.id}/confirm`, { method: 'PATCH' });
  assert.equal((await carol(`/transactions/${tx.id}/confirm`, { method: 'PATCH' })).json.completed, true);
  assert.equal((await client()(`/items/${auc.id}`)).json.item.status, 'sold');
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM transactions WHERE auction_id = (SELECT id FROM auctions WHERE item_id = ?)', [auc.id]);
  assert.equal(n, 1);
});

test('auction with no bids ends quietly and can be relisted', async () => {
  const auc = await makeAuction(carol);
  assert.equal((await carol(`/items/${auc.id}/auction/relist`, jopts('POST', { durationHours: 24 }))).status, 409, 'still running');
  await endAuctionNow(auc.id);
  assert.equal((await client()(`/items/${auc.id}`)).json.item.auction.status, 'ended');
  assert.equal((await dave(`/items/${auc.id}/auction/relist`, jopts('POST', { durationHours: 24 }))).status, 403);
  assert.equal((await carol(`/items/${auc.id}/auction/relist`, jopts('POST', { durationHours: 24 }))).status, 200);
  const a = (await client()(`/items/${auc.id}`)).json.item.auction;
  assert.equal(a.status, 'active');
  assert.ok(new Date(a.endsAt) > new Date());
});

test('seller can cancel an auction: bidders are told, listing leaves browse', async () => {
  const auc = await makeAuction(carol, { title: `${TOKEN} cancelme` });
  await dave(`/items/${auc.id}/bids`, jopts('POST', { amount: 100 }));
  assert.equal((await dave(`/items/${auc.id}/auction/cancel`, { method: 'POST' })).status, 403);
  assert.equal((await carol(`/items/${auc.id}/auction/cancel`, { method: 'POST' })).status, 200);
  assert.equal((await carol(`/items/${auc.id}/auction/cancel`, { method: 'POST' })).status, 409);
  const n = (await dave('/notifications')).json.notifications.find((x) => /cancelled/i.test(x.title));
  assert.ok(n);
  assert.ok(!(await client()(`/items?q=${TOKEN}+cancelme`)).json.items.some((i) => i.id === auc.id));
  assert.equal((await dave(`/items/${auc.id}/bids`, jopts('POST', { amount: 500 }))).status, 409);
  assert.equal((await carol(`/items/${auc.id}`, { method: 'DELETE' })).status, 200, 'now it may be removed');
});

// ------------------------------------------------------------------ Phase 7: notifications + messaging
test('notifications: unread count, mark one read, mark all, privacy', async () => {
  const item = await makeItem(erin);
  await request(frank, item.id);
  const before = (await erin('/notifications/unread-count')).json.unread;
  assert.ok(before >= 1);
  const list = (await erin('/notifications')).json.notifications;
  assert.equal(list[0].isRead, false);
  assert.equal((await frank(`/notifications/${list[0].id}/read`, { method: 'PATCH' })).status, 404, "cannot touch someone else's");
  assert.equal((await erin(`/notifications/${list[0].id}/read`, { method: 'PATCH' })).status, 200);
  assert.equal((await erin('/notifications/unread-count')).json.unread, before - 1);
  assert.equal((await erin('/notifications/read-all', { method: 'PATCH' })).status, 200);
  assert.equal((await erin('/notifications/unread-count')).json.unread, 0);
  assert.equal((await erin('/notifications?unread=1')).json.notifications.length, 0);
  assert.equal((await client()('/notifications')).status, 401);
});

test('messaging: only participants can read or write; unread counts; one notification per chat', async () => {
  const item = await makeItem(carol);
  const start = await dave('/conversations', jopts('POST', { userId: carol.user.id, itemId: item.id }));
  assert.equal(start.status, 201);
  const id = start.json.conversationId;
  assert.equal((await dave('/conversations', jopts('POST', { userId: carol.user.id, itemId: item.id }))).json.conversationId, id, 'same thread is reused');
  assert.equal((await carol('/conversations', jopts('POST', { userId: carol.user.id }))).status, 400, 'no messaging yourself');
  assert.equal((await dave('/conversations', jopts('POST', { userId: 999999 }))).status, 404);

  assert.equal((await dave(`/conversations/${id}/messages`, jopts('POST', { body: '   ' }))).status, 400);
  assert.equal((await dave(`/conversations/${id}/messages`, jopts('POST', { body: 'x'.repeat(2001) }))).status, 400);
  assert.equal((await dave(`/conversations/${id}/messages`, jopts('POST', { body: 'Is it still available?' }))).status, 201);
  assert.equal((await dave(`/conversations/${id}/messages`, jopts('POST', { body: 'Can we meet at the library?' }))).status, 201);

  assert.equal((await frank(`/conversations/${id}/messages`)).status, 404, 'outsider cannot read');
  assert.equal((await frank(`/conversations/${id}/messages`, jopts('POST', { body: 'hi' }))).status, 404, 'outsider cannot write');
  assert.equal((await frank(`/conversations/${id}/read`, { method: 'PATCH' })).status, 404);
  assert.equal((await client()(`/conversations/${id}/messages`)).status, 401);

  const convs = (await carol('/conversations')).json.conversations;
  const mine = convs.find((c) => c.id === id);
  assert.equal(mine.unread, 2);
  assert.equal(mine.other.id, dave.user.id);
  assert.equal((await frank('/conversations')).json.conversations.some((c) => c.id === id), false);
  assert.equal((await carol('/notifications')).json.notifications.filter((n) => n.type === 'new_message' && n.relatedId === id).length, 1);

  const msgs = (await carol(`/conversations/${id}/messages`)).json;
  assert.equal(msgs.messages.length, 2);
  assert.equal(msgs.messages[0].mine, false);
  await carol(`/conversations/${id}/read`, { method: 'PATCH' });
  assert.equal((await carol('/conversations')).json.conversations.find((c) => c.id === id).unread, 0);
  assert.equal((await carol(`/conversations/${id}/messages`, jopts('POST', { body: 'Yes, tomorrow 10am.' }))).status, 201);
  assert.equal((await dave('/conversations')).json.conversations.find((c) => c.id === id).lastMessage, 'Yes, tomorrow 10am.');
});

// ------------------------------------------------------------------ Phase 8: reports + admin
test('reports: validation, self-report, duplicates', async () => {
  const item = await makeItem(carol);
  assert.equal((await frank('/reports', jopts('POST', { itemId: item.id, reason: 'nonsense' }))).status, 400);
  assert.equal((await frank('/reports', jopts('POST', { reason: 'spam' }))).status, 400, 'needs a target');
  assert.equal((await frank('/reports', jopts('POST', { itemId: item.id, userId: carol.user.id, reason: 'spam' }))).status, 400, 'only one target');
  assert.equal((await carol('/reports', jopts('POST', { itemId: item.id, reason: 'spam' }))).status, 400, 'own listing');
  assert.equal((await carol('/reports', jopts('POST', { userId: carol.user.id, reason: 'spam' }))).status, 400, 'self');
  assert.equal((await frank('/reports', jopts('POST', { itemId: item.id, reason: 'fraud', details: 'Looks fake' }))).status, 201);
  assert.equal((await frank('/reports', jopts('POST', { itemId: item.id, reason: 'fraud' }))).status, 409);
  assert.equal((await client()('/reports', jopts('POST', { itemId: item.id, reason: 'spam' }))).status, 401);
});

test('admin routes are closed to students and anonymous visitors', async () => {
  for (const path of ['/admin/stats', '/admin/users', '/admin/items', '/admin/requests', '/admin/reports']) {
    assert.equal((await client()(path)).status, 401, path);
    assert.equal((await dave(path)).status, 403, path);
  }
  assert.equal((await dave('/admin/users/1/status', jopts('PATCH', { status: 'suspended' }))).status, 403);
  assert.equal((await dave('/admin/items/1', { method: 'DELETE' })).status, 403);
  assert.equal((await dave('/admin/reports/1', jopts('PATCH', { status: 'resolved' }))).status, 403);
});

test('admin: statistics, users, items, requests lists', async () => {
  const s = (await admin('/admin/stats')).json;
  for (const k of ['students', 'activeListings', 'completedTransactions', 'pendingRequests', 'reportedListings', 'openReports', 'liveAuctions'])
    assert.equal(typeof s.totals[k], 'number', k);
  assert.ok(s.totals.students >= 8);
  assert.ok(s.totals.reportedListings >= 1, 'the report from the previous test is open');
  assert.equal(s.byCategory.length, 8);
  assert.ok(s.signupsLast14Days.length >= 1);

  const users = (await admin(`/admin/users?q=${encodeURIComponent('dave' + run)}`)).json;
  assert.equal(users.total, 1);
  assert.equal(users.users[0].email, `dave${run}@test.com`, 'admins can see emails');
  assert.ok((await admin('/admin/items?state=reported')).json.items.length >= 1);
  assert.ok((await admin('/admin/requests?status=completed')).json.total >= 1);
  assert.equal((await admin('/admin/users?limit=500')).status, 400);
});

test('admin: suspending an account locks it out immediately; admins are protected', async () => {
  const id = erin.user.id;
  assert.equal((await admin(`/admin/users/${id}/status`, jopts('PATCH', { status: 'suspended' }))).status, 200);
  assert.equal((await erin('/auth/me')).status, 403, 'existing session stops working');
  const login = await client()('/auth/login', jopts('POST', { email: `erin${run}@test.com`, password: 'Passw0rdX' }));
  assert.equal(login.status, 403);
  assert.equal((await admin(`/admin/users/${id}/status`, jopts('PATCH', { status: 'active' }))).status, 200);
  assert.equal((await erin('/auth/me')).status, 200);
  assert.equal((await admin(`/admin/users/${(await admin('/auth/me')).json.user.id}/status`, jopts('PATCH', { status: 'suspended' }))).status, 400, 'not yourself');
  assert.equal((await admin(`/admin/users/${id}/status`, jopts('PATCH', { status: 'banned' }))).status, 400);
});

test('admin: resolving a report can remove the listing; requests are cancelled; owner is notified', async () => {
  const item = await makeItem(carol, { title: `${TOKEN} badlisting` });
  const pending = (await request(dave, item.id)).json.request;
  await frank('/reports', jopts('POST', { itemId: item.id, reason: 'inappropriate' }));
  const rep = (await admin('/admin/reports?status=open')).json.reports.find((r) => r.item?.id === item.id);
  assert.ok(rep);
  assert.equal((await admin(`/admin/reports/${rep.id}`, jopts('PATCH', { status: 'resolved', removeListing: true }))).status, 200);
  assert.equal((await client()(`/items/${item.id}`)).status, 404);
  assert.ok(!(await client()(`/items?q=${TOKEN}+badlisting`)).json.items.length);
  assert.equal((await dave('/requests?box=sent')).json.requests.find((r) => r.id === pending.id).status, 'cancelled');
  assert.ok((await notifTypes(carol)).includes('listing_removed'));
  assert.equal((await admin(`/admin/reports/${rep.id}`, jopts('PATCH', { status: 'dismissed' }))).status, 409, 'already closed');
  assert.equal((await admin(`/admin/items/${item.id}`, { method: 'DELETE' })).status, 409, 'already removed');
  assert.equal((await admin(`/admin/items/${item.id}/restore`, { method: 'PATCH' })).status, 200);
  assert.equal((await client()(`/items/${item.id}`)).status, 200);
});

test('admin: removing a listing in an in-progress exchange cancels the deal and frees the other item', async () => {
  const wanted = await makeItem(carol, { listingType: 'both', price: 50 });
  const offered = await makeItem(dave, { listingType: 'exchange', price: undefined });
  const r = (await request(dave, wanted.id, 'exchange', { offeredItemId: offered.id })).json.request;
  const { transactionId } = (await carol(`/requests/${r.id}/accept`, { method: 'PATCH' })).json;
  assert.equal((await client()(`/items/${offered.id}`)).json.item.status, 'reserved');

  assert.equal((await admin(`/admin/items/${wanted.id}`, jopts('DELETE', { reason: 'Counterfeit' }))).status, 200);
  assert.equal((await dave(`/transactions/${transactionId}`)).json.transaction.status, 'cancelled');
  assert.equal((await client()(`/items/${offered.id}`)).json.item.status, 'available');
  assert.ok((await notifTypes(dave)).includes('transaction_cancelled'));
});

test('admin: removing a live auction cancels it and tells the bidders', async () => {
  const auc = await makeAuction(carol);
  await bidders[2](`/items/${auc.id}/bids`, jopts('POST', { amount: 100 }));
  assert.equal((await admin(`/admin/items/${auc.id}`, { method: 'DELETE' })).status, 200);
  assert.ok((await bidders[2]('/notifications')).json.notifications.some((n) => /cancelled/i.test(n.title)));
  assert.equal((await bidders[3](`/items/${auc.id}/bids`, jopts('POST', { amount: 900 }))).status, 404);
});
