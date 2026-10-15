// Integration tests for Phase 3. Start the API first (npm run dev), then run: npm test
// Uses Node's built-in test runner; needs Node 20+.
import test from 'node:test';
import assert from 'node:assert/strict';
import { solidPng } from '../utils/placeholderPng.js';

const BASE = process.env.API_URL || 'http://localhost:5000/api';
const run = Date.now();

function client() {
  let cookie = '';
  return async (path, opts = {}) => {
    const res = await fetch(BASE + path, { ...opts, headers: { ...(opts.headers || {}), cookie } });
    const set = res.headers.getSetCookie?.() || [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };
}
const png = (kb = 0) => new Blob([kb ? Buffer.concat([solidPng(10, 20, 30), Buffer.alloc(kb * 1024)]) : solidPng(10, 20, 30)], { type: 'image/png' });
const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function listingForm(fields, images = [png()]) {
  const f = new FormData();
  const base = { title: 'Test Textbook', description: 'A test description long enough.', categoryId: 1, listingType: 'sale', condition: 'good', price: 100 };
  for (const [k, v] of Object.entries({ ...base, ...fields })) if (v !== undefined) f.append(k, String(v));
  images.forEach((b, i) => f.append('images', b, `p${i}.png`));
  return f;
}

const alice = client();
const bob = client();
let itemId;

test('setup: register two students', async () => {
  for (const [c, n] of [[alice, 'alice'], [bob, 'bob']]) {
    const r = await c('/auth/register', json({ fullName: `Test ${n}`, email: `${n}${run}@test.com`, college: 'Test College', department: 'CSE', academicYear: 2, password: 'Passw0rdX', confirmPassword: 'Passw0rdX' }));
    assert.equal(r.status, 201, r.text);
  }
});

test('listing without an image is rejected', async () => {
  const r = await alice('/items', { method: 'POST', body: listingForm({}, []) });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /at least one image/i);
});

test('a text file renamed to .png is rejected (magic-byte check)', async () => {
  const fake = new Blob(['<script>alert(1)</script> not an image at all'], { type: 'image/png' });
  const r = await alice('/items', { method: 'POST', body: listingForm({}, [fake]) });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /not a valid/i);
});

test('image over 2 MB is rejected', async () => {
  const r = await alice('/items', { method: 'POST', body: listingForm({}, [png(2100)]) });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /2 MB/);
});

test('more than 5 images is rejected', async () => {
  const r = await alice('/items', { method: 'POST', body: listingForm({}, Array.from({ length: 6 }, () => png())) });
  assert.equal(r.status, 400);
});

test('sale listing needs a price', async () => {
  const r = await alice('/items', { method: 'POST', body: listingForm({ price: undefined }) });
  assert.equal(r.status, 400);
});

test('unauthenticated users cannot create listings', async () => {
  const r = await client()('/items', { method: 'POST', body: listingForm({}) });
  assert.equal(r.status, 401);
});

test('valid sale listing is created with its image', async () => {
  const r = await alice('/items', { method: 'POST', body: listingForm({}) });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.item.images.length, 1);
  assert.match(r.json.item.images[0].url, /^\/uploads\/items\/[0-9a-f-]+\.png$/);
  assert.equal(r.json.item.price, 100);
  assert.equal(r.json.item.status, 'available');
  itemId = r.json.item.id;
});

test('auction needs a duration; valid auction starts at the starting price', async () => {
  const bad = await alice('/items', { method: 'POST', body: listingForm({ listingType: 'auction', price: undefined, startingPrice: 200 }) });
  assert.equal(bad.status, 400);
  const ok = await alice('/items', { method: 'POST', body: listingForm({ listingType: 'auction', price: undefined, startingPrice: 200, minIncrement: 20, durationHours: 24 }) });
  assert.equal(ok.status, 201, ok.text);
  assert.equal(ok.json.item.price, null);
  assert.equal(ok.json.item.auction.currentPrice, 200);
  assert.equal(ok.json.item.auction.bidCount, 0);
  assert.ok(new Date(ok.json.item.auction.endsAt) > new Date());
});

test('listing is public and leaks no private data', async () => {
  const r = await client()(`/items/${itemId}`);
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /password|@test\.com/i);
});

test("another student cannot edit or delete someone else's listing", async () => {
  const put = await bob(`/items/${itemId}`, { method: 'PUT', body: listingForm({ title: 'Hijacked' }) });
  assert.equal(put.status, 403);
  const del = await bob(`/items/${itemId}`, { method: 'DELETE' });
  assert.equal(del.status, 403);
});

test('owner can edit; cannot remove the last image; can swap images', async () => {
  const cur = (await alice(`/items/${itemId}`)).json.item;
  const edit = await alice(`/items/${itemId}`, { method: 'PUT', body: (() => { const f = listingForm({ title: 'Renamed Textbook', price: 150 }, []); f.append('keepImageIds', cur.images[0].id); return f; })() });
  assert.equal(edit.status, 200, edit.text);
  assert.equal(edit.json.item.title, 'Renamed Textbook');
  assert.equal(edit.json.item.price, 150);

  const noImg = await alice(`/items/${itemId}`, { method: 'PUT', body: listingForm({}, []) }); // keeps none, adds none
  assert.equal(noImg.status, 400);

  const swap = await alice(`/items/${itemId}`, { method: 'PUT', body: listingForm({}, [png()]) }); // drops old, adds new
  assert.equal(swap.status, 200);
  assert.equal(swap.json.item.images.length, 1);
  assert.notEqual(swap.json.item.images[0].id, cur.images[0].id);
});

test('an auction cannot be converted to a fixed-price listing', async () => {
  const mine = (await alice('/items/mine')).json.items.find((i) => i.listingType === 'auction');
  const f = listingForm({ listingType: 'sale', price: 99 }, []);
  f.append('keepImageIds', mine.images[0].id);
  const r = await alice(`/items/${mine.id}`, { method: 'PUT', body: f });
  assert.equal(r.status, 400);
});

test('/items/mine lists only my listings', async () => {
  const a = await alice('/items/mine');
  const b = await bob('/items/mine');
  assert.ok(a.json.items.length >= 2);
  assert.equal(b.json.items.length, 0);
});

test('profile: update, public view hides email, password change checks current password', async () => {
  const upd = await alice('/users/me', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fullName: 'Alice Updated', college: 'New College', department: 'ECE', academicYear: 3, role: 'admin', email: 'x@y.com' }) });
  assert.equal(upd.status, 200);
  assert.equal(upd.json.user.role, 'student', 'role must not be changeable');
  assert.match(upd.json.user.email, /^alice\d+@test\.com$/, 'email must not be changeable');

  const pub = await client()(`/users/${upd.json.user.id}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.json.profile.fullName, 'Alice Updated');
  assert.doesNotMatch(pub.text, /password|@test\.com/i);
  assert.ok(pub.json.profile.activeListings.length >= 1);

  const wrong = await alice('/users/me/password', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: 'nope', newPassword: 'Brand1New' }) });
  assert.equal(wrong.status, 401);
  const weak = await alice('/users/me/password', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: 'Passw0rdX', newPassword: 'short' }) });
  assert.equal(weak.status, 400);
  const good = await alice('/users/me/password', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: 'Passw0rdX', newPassword: 'Brand1New' }) });
  assert.equal(good.status, 200);
});

test('avatar upload validates the file', async () => {
  const bad = new FormData(); bad.append('avatar', new Blob(['not an image, just text here'], { type: 'image/png' }), 'a.png');
  assert.equal((await bob('/users/me/avatar', { method: 'POST', body: bad })).status, 400);
  const ok = new FormData(); ok.append('avatar', png(), 'a.png');
  const r = await bob('/users/me/avatar', { method: 'POST', body: ok });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.user.profileImage, /^\/uploads\/avatars\//);
});

test('owner can delete; deleted listing returns 404', async () => {
  assert.equal((await alice(`/items/${itemId}`, { method: 'DELETE' })).status, 200);
  assert.equal((await client()(`/items/${itemId}`)).status, 404);
});

test('categories endpoint returns the 8 seeded categories', async () => {
  const r = await client()('/categories');
  assert.equal(r.json.categories.length, 8);
});
