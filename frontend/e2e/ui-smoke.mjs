import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, CookieJar } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { solidPng } from '../../backend/utils/placeholderPng.js';

// UI smoke test: loads the BUILT app in jsdom, backed by the real API + database, and clicks through the main flows.
// Prerequisites: API running on :5000 with a freshly seeded DB; stop `npm run dev` for the frontend (this uses :5173).
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = 5173, BASE = `http://localhost:${PORT}`;
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };

// static server + same-origin proxy to the API (what Vite's dev proxy does)
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/uploads')) {
    const p = http.request({ host: '127.0.0.1', port: 5000, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on('error', () => { res.writeHead(502); res.end(); });
    return req.pipe(p);
  }
  let file = path.join(DIST, req.url.split('?')[0]);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  let body = fs.readFileSync(file);
  if (file.endsWith('index.html')) body = body.toString().replace('<script type="module" crossorigin', '<script defer');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'text/html' });
  res.end(body);
}).listen(PORT);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0; const failed = [];
async function step(name, fn) {
  try { await fn(); passed++; console.log('PASS', name); }
  catch (e) { failed.push(name); console.log('FAIL', name, '->', e.message.split('\n')[0]); }
}

async function session(p = '/') {
  const errors = [];
  const dom = await JSDOM.fromURL(BASE + p, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, cookieJar: new CookieJar(),
    beforeParse(w) {
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.confirm = () => true; w.prompt = (m, d) => d; w.scrollTo = () => {};
      w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
      w.addEventListener('error', (e) => errors.push(e.message));
      const ce = w.console.error; w.console.error = (...a) => { errors.push(a.join(' ').slice(0, 200)); ce.apply(w.console, a); };
    },
  });
  const w = dom.window, d = w.document;
  const s = {
    w, d, errors,
    text: () => d.body.textContent,
    path: () => w.location.pathname + w.location.search,
    async waitFor(fn, label = 'condition', ms = 9000) {
      const t0 = Date.now();
      for (;;) { try { const v = fn(); if (v) return v; } catch { /* retry */ } if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${label}; page says: "${d.body.textContent.replace(/\s+/g, ' ').slice(0, 160)}"`); await sleep(60); }
    },
    waitText: (t) => s.waitFor(() => s.text().includes(t), `text "${t}"`),
    find: (sel, txt) => [...d.querySelectorAll(sel)].find((el) => !txt || el.textContent.trim().includes(txt)),
    all: (sel) => [...d.querySelectorAll(sel)],
    click: (el) => { if (!el) throw new Error('element to click not found'); el.click(); },
    async clickText(sel, txt) { const el = await s.waitFor(() => s.find(sel, txt), `${sel} containing "${txt}"`); el.click(); },
    set(el, v) {
      if (!el) throw new Error('input not found');
      const proto = el instanceof w.HTMLTextAreaElement ? w.HTMLTextAreaElement.prototype : el instanceof w.HTMLSelectElement ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true }));
    },
    submit: (form) => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })),
    go(p) { w.history.pushState({}, '', p); w.dispatchEvent(new w.PopStateEvent('popstate')); },
    async login(email, password) {
      s.go('/login');
      await s.waitFor(() => s.find('input[type=email]'), 'login form');
      s.set(s.find('input[type=email]'), email); s.set(s.find('input[type=password]'), password);
      s.submit(s.find('form'));
      await s.waitText('Log out');
    },
  };
  await s.waitFor(() => d.querySelector('header.navbar'), 'app to mount');
  return s;
}

const PW = 'Student123';
let guest, ana, kar, adm;

await step('guest: storefront shows 8 category tiles, shelves, auctions strip', async () => {
  guest = await session('/');
  await guest.waitFor(() => guest.all('.tile').length === 8, '8 tiles');
  await guest.waitFor(() => guest.all('.shelf .item-card').length >= 6, 'item cards');
  await guest.waitText('Auctions ending soon');
  await guest.waitText('Casio fx-991EX');
  await guest.waitText('How EduSwap works');
});

await step('guest: hero search navigates to browse and filters results', async () => {
  guest.set(guest.find('.hero-search input'), 'multimeter');
  guest.submit(guest.find('.hero-search'));
  await guest.waitFor(() => guest.path().startsWith('/browse?q=multimeter'), 'browse url');
  await guest.waitFor(() => guest.all('.grid .item-card').length === 1, 'one result');
  await guest.waitText('Digital multimeter');
  await guest.waitText('1 result');
});

await step('guest: type filter, sort and pagination controls on browse', async () => {
  guest.go('/browse');
  await guest.waitFor(() => guest.all('.grid .item-card').length >= 8, 'all items');
  await guest.clickText('label.radio', 'Auctions');
  await guest.waitFor(() => guest.path().includes('type=auction') && guest.all('.grid .item-card').length === 2, 'two auctions');
  guest.set(guest.find('.sort select'), 'price_desc');
  await guest.waitFor(() => guest.path().includes('sort=price_desc'), 'sort in url');
  guest.go('/browse?category=electronics');
  await guest.waitFor(() => guest.all('.grid .item-card').length === 2, 'electronics items');
  guest.go('/browse?q=zzzznothing');
  await guest.waitText('No items match your search');
});

await step('guest: item page invites login; protected pages redirect to login', async () => {
  guest.go('/items/6');
  await guest.waitText('White lab coat');
  await guest.waitText('to buy, exchange, bid or message the seller');
  guest.go('/requests');
  await guest.waitFor(() => guest.path() === '/login', 'redirect to /login');
  guest.go('/admin');
  await guest.waitFor(() => guest.path() === '/login', 'admin redirects too');
});

await step('student A (Ananya): registers nothing, logs in and sees dashboard stats', async () => {
  ana = await session('/');
  await ana.login('ananya@example.com', PW);
  ana.go('/dashboard');
  await ana.waitText('Active listings');
  await ana.waitText('Saved items');
});

await step('A: sends a purchase request for a lab coat via the UI', async () => {
  ana.go('/items/6');
  await ana.waitText('White lab coat');
  await ana.clickText('button', 'Request to buy');
  await ana.waitFor(() => ana.find('.request-panel textarea'), 'request panel');
  ana.set(ana.find('.request-panel textarea'), 'Can we meet at the library?');
  await ana.clickText('button', 'Send purchase request');
  await ana.waitText('Purchase request sent');
  await ana.waitText('You already sent a purchase request');
  ana.go('/requests?box=sent');
  await ana.waitFor(() => ana.text().includes('pending') && ana.text().includes('White lab coat'), 'sent request listed');
});

await step('A: places a bid on the calculator auction and sees highest-bidder status', async () => {
  ana.go('/items/5');
  await ana.waitText('Casio fx-991EX');
  const input = await ana.waitFor(() => ana.find('.bid-form input'), 'bid input');
  ana.set(input, '500');
  await ana.clickText('button', 'Place bid');
  await ana.waitText('You are the highest bidder');
  await ana.waitFor(() => ana.text().includes('500') && ana.text().includes('Bid history'), 'bid history');
});

await step('A: messages the seller; message appears in the thread', async () => {
  ana.go('/items/6');
  await ana.clickText('button', 'Message seller');
  await ana.waitFor(() => ana.path().startsWith('/messages/') && ana.find('.composer input'), 'chat page');
  ana.set(ana.find('.composer input'), 'Hi Karthik, is the lab coat still available?');
  ana.submit(ana.find('.composer'));
  await ana.waitFor(() => ana.all('.bubble.mine').length === 1, 'sent bubble');
});

await step('A: saves an item to the wishlist and reports a listing', async () => {
  ana.go('/items/8');
  await ana.clickText('button', 'Save');
  await ana.waitText('Saved');
  ana.go('/wishlist');
  await ana.waitText('Digital multimeter');
  ana.go('/items/8');
  await ana.clickText('button', 'Report');
  const sel = await ana.waitFor(() => ana.find('.report-form select'), 'report form');
  ana.set(sel, 'fraud');
  ana.submit(ana.find('.report-form'));
  await ana.waitText('Report submitted');
});

await step('B (Karthik): bell badge, notification opens the request, accepts it', async () => {
  kar = await session('/');
  await kar.login('karthik@example.com', 'Student123');
  await kar.waitFor(() => kar.find('.bell .count'), 'unread badge on the bell');
  kar.go('/notifications');
  await kar.waitText('New purchase request');
  await kar.waitText('outbid').catch(() => {}); // not expected; ignore
  await kar.clickText('button.notif', 'New purchase request');
  await kar.waitFor(() => kar.path().startsWith('/requests?box=received'), 'requests page');
  await kar.waitText('Can we meet at the library?');
  await kar.clickText('button', 'Accept');
  await kar.waitText('Request accepted');
});

await step('B: replies in chat; unread badge on conversation list', async () => {
  kar.go('/messages');
  await kar.waitFor(() => kar.all('.conv').length >= 1, 'conversation list');
  await kar.waitFor(() => kar.find('.conv .count'), 'unread count in list');
  kar.click(kar.find('.conv'));
  await kar.waitFor(() => kar.find('.bubble') && kar.find('.composer input'), 'thread loaded');
  kar.set(kar.find('.composer input'), 'Yes! See you tomorrow.');
  kar.submit(kar.find('.composer'));
  await kar.waitFor(() => kar.all('.bubble.mine').length === 1, 'reply bubble');
  await kar.waitFor(() => !kar.find('.conv .count'), 'unread cleared after opening');
});

await step('B: my listings shows auction controls; delete disabled while bids are live', async () => {
  kar.go('/my-listings');
  await kar.waitText('Casio fx-991EX');
  await kar.waitText('Cancel auction');
  const del = kar.all('.item-card').find((c) => c.textContent.includes('Casio')).querySelector('.btn-danger');
  if (!del.disabled) throw new Error('Delete should be disabled for an auction with bids');
});

await step('B then A: both confirm the handover -> completed, then A leaves a review', async () => {
  kar.go('/transactions');
  await kar.clickText('button', 'Confirm handover');
  await kar.waitText('Confirmation recorded');
  ana.go('/transactions');
  await ana.waitText('Karthik Reddy');
  await ana.waitText('has confirmed');
  await ana.clickText('button', 'Confirm handover');
  await ana.waitText('Transaction completed');
  await ana.waitText('Rate Karthik Reddy');
  ana.click(ana.find('.star-input button[aria-label="4 stars"]'));
  ana.set(ana.find('.review-form textarea'), 'Quick and friendly handover.');
  ana.submit(ana.find('.review-form'));
  await ana.waitText('Thanks for your review');
  await ana.waitText('You reviewed this transaction');
  ana.go('/users/3');
  await ana.waitFor(() => ana.text().includes('Quick and friendly handover') && ana.text().includes('Completed deals'), 'review on profile');
});

await step('A: creates a listing with a photo through the form', async () => {
  ana.go('/listings/new');
  await ana.waitFor(() => ana.find('form.listing-form') && ana.all('select[name=categoryId] option').length > 1, 'form ready');
  const f = ana.find('form.listing-form');
  // client-side check: submitting without a photo is blocked
  ana.set(ana.find('input[name=title]'), 'E2E Graph paper pad');
  ana.set(ana.find('textarea[name=description]'), 'Fifty sheets of engineering graph paper.');
  ana.set(ana.find('select[name=categoryId]'), '8');
  ana.set(ana.find('input[name=price]'), '60');
  ana.submit(f);
  await ana.waitText('Please add at least one photo');
  const file = new ana.w.File([solidPng(1, 2, 3)], 'photo.png', { type: 'image/png' });
  const input = ana.find('input[type=file]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new ana.w.Event('change', { bubbles: true }));
  await ana.waitFor(() => ana.all('.thumb img').length === 1, 'photo preview');
  ana.submit(ana.find('form.listing-form'));
  await ana.waitFor(() => /^\/items\/\d+$/.test(ana.path()), 'redirect to the new item');
  await ana.waitText('E2E Graph paper pad');
  await ana.waitFor(() => ana.find('.gallery-main img')?.getAttribute('src')?.startsWith('/uploads/items/'), 'image served from /uploads');
});

await step('student cannot open the admin area', async () => {
  ana.go('/admin');
  await ana.waitFor(() => ana.path() === '/dashboard', 'redirected away from /admin');
});

await step('admin: dashboard cards, reports queue, remove listing, users, statistics', async () => {
  adm = await session('/');
  await adm.login('admin@eduswap.local', 'ChangeMe123');
  adm.go('/admin');
  await adm.waitText('Registered students');
  await adm.waitText('Reported listings');
  adm.go('/admin/reports');
  await adm.waitText('Digital multimeter');
  await adm.clickText('button', 'Remove listing');
  await adm.waitText('Report updated');
  adm.go('/admin/users');
  await adm.waitFor(() => adm.all('tbody tr').length >= 4, 'users table');
  await adm.waitText('ananya@example.com');
  adm.go('/admin/listings?state=removed');
  await adm.waitText('Digital multimeter');
  adm.go('/admin/stats');
  await adm.waitText('Listings by category');
  adm.go('/admin/requests');
  await adm.waitText('White lab coat');
});

await step('removed listing disappears for visitors', async () => {
  guest.go('/items/8');
  await guest.waitText('Listing not found');
});

await step('no uncaught errors or React warnings in any session', async () => {
  const all = [guest, ana, kar, adm].flatMap((s) => s.errors).filter((m) => !/Not implemented: navigation|Could not parse CSS/.test(m));
  if (all.length) throw new Error(all.slice(0, 3).join(' | '));
});

console.log(`\n${passed} passed, ${failed.length} failed`);
server.close();
process.exit(failed.length ? 1 : 0);
