# EduSwap – Student Accessories Exchange Platform

A full-stack marketplace where college students **buy, sell, exchange and auction** used academic materials: textbooks, drawing kits, calculators, lab coats, lab equipment, electronics and notes.

**Stack:** React 18 + Vite · Node.js + Express · MySQL 8 · JWT in an httpOnly cookie · Multer uploads · bcrypt.

## Features
- **Storefront home** like a shopping site: category tiles, a shelf of newest items per category, "auctions ending soon", how-it-works.
- **Browse** with keyword search, category, listing type, condition, college, price range, sorting and pagination.
- **Listings** (sale / exchange / both / **auction**) with **1-5 required photos**, edit and delete by the owner only.
- **Auctions:** starting bid, minimum increment, end time, live countdown, bid history, outbid alerts, anti-sniping (+2 min if a bid lands in the last 2 minutes), automatic winner → transaction.
- **Purchase & exchange requests**, accept / reject / cancel, with safe handling of competing requests.
- **Transactions:** both sides confirm the handover → items marked sold/exchanged; then **ratings & reviews**.
- **Messaging** between students, **notifications** with unread badge, **wishlist**, **reports**.
- **Admin dashboard:** statistics, student accounts (suspend/reactivate), listing moderation, requests monitor, reports queue, platform statistics.

Payments are **not** processed online: students pay and hand over in person on campus.

## Project structure
```
eduswap/
├── backend/          Express API (routes → validators → middleware → controllers → services)
│   ├── config/ controllers/ middleware/ routes/ services/ validators/ utils/
│   ├── tests/        API integration tests (node:test)
│   ├── uploads/      uploaded images (git-ignored)
│   ├── seed.js  server.js  app.js  .env.example
├── frontend/         React app (Vite)
│   ├── src/ components/ pages/ pages/admin/ context/ services/ hooks/ utils/
│   └── e2e/ui-smoke.mjs   UI smoke test
├── database/schema.sql    creates the `eduswap` database, all tables and the 8 categories
├── docs/API.md            full endpoint reference
└── README.md
```

## Setup (development)
**Prerequisites:** Node.js 20+ (22 recommended), MySQL 8+, Git.

```bash
# 1. Database
mysql -u root -p < database/schema.sql
#    Optional: a dedicated DB user instead of root
#    CREATE USER 'eduswap_app'@'localhost' IDENTIFIED BY 'a_strong_password';
#    GRANT SELECT, INSERT, UPDATE, DELETE ON eduswap.* TO 'eduswap_app'@'localhost';

# 2. Backend
cd backend
npm install
cp .env.example .env            # Windows: copy .env.example .env
#   edit .env: DB_USER, DB_PASSWORD, JWT_SECRET (32+ random chars:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
npm run seed                    # admin + 3 students + 10 sample listings (2 auctions)
npm run dev                     # http://localhost:5000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```
> **Upgrading from an earlier phase?** `schema.sql` changed (auctions, bids, notification types). Run `DROP DATABASE eduswap;` then re-import it and re-run `npm run seed`.

Vite proxies `/api` and `/uploads` to port 5000, so the login cookie and images work on one origin.

### Seed accounts
| Role | Email | Password |
|---|---|---|
| Admin | `admin@eduswap.local` (`SEED_ADMIN_EMAIL`) | `ChangeMe123` (`SEED_ADMIN_PASSWORD`) |
| Students | ananya@example.com, karthik@example.com, sneha@example.com | `Student123` (`SEED_STUDENT_PASSWORD`) |

**Change all of these before deploying.** The sample listings use plain solid-colour placeholder images.

### Quick tour
1. Log in as Ananya, open **Browse**, request to buy Karthik's lab coat and bid on his calculator auction.
2. Log in as Karthik (another browser/private window): the 🔔 shows the request. **Requests → Accept**.
3. **Transactions:** both confirm the handover → completed → leave a review.
4. Log in as the admin: **/admin** for stats, users, listings, reports.

## Rules the server enforces
- Every listing needs 1-5 images, checked by file **content** (JPEG/PNG/WebP, ≤2 MB), stored under random names.
- Only owners edit/delete their listings; sold/reserved items are locked; auctions can't switch type and freeze prices after the first bid.
- You can't request your own listing, request an auction item, or send a second pending request for the same item.
- Accepting a request locks the item rows, re-checks availability, reserves the item(s), creates the transaction and rejects competing requests **in one DB transaction**. Two simultaneous accepts: exactly one wins.
- Bids lock the auction row, so simultaneous bids can't both win. Minimum bid = current + increment.
- A transaction completes only after **both** students confirm. Reviews: completed transactions only, 1-5 stars, one per person.
- Conversations and transactions are visible only to participants (others get 404). Suspended accounts lose access immediately.
- Role checks happen on the server for every admin route; the UI guards are only a convenience.

## Security summary
bcrypt (12 rounds) · generic login errors + constant-time compare · httpOnly, SameSite=Lax (Secure in production) cookie · helmet · CORS limited to `CLIENT_URL` · rate limits on login/register · express-validator on bodies, params and queries · parameterized SQL only (LIKE wildcards escaped) · upload type/size/count checks by magic bytes · uploads served statically, never executed · generic 500 errors with details logged server-side · secrets only in `.env`.

## Testing
All tests run against a real MySQL database and the running API.

```bash
# Terminal 1 (fresh DB):  mysql -u root -p -e "DROP DATABASE IF EXISTS eduswap" && mysql -u root -p < database/schema.sql
cd backend && npm run seed && npm run dev

# Terminal 2 – API tests (46 tests: validation, authorization, concurrency, workflows)
cd backend && npm test
```
Registration and login are rate limited. When running the suite repeatedly, add `LOGIN_MAX_ATTEMPTS=1000` and `REGISTER_MAX_PER_HOUR=1000` to `backend/.env` (development only).

```bash
# UI smoke test (18 steps): loads the built app in jsdom and clicks through browse, requests,
# bidding, chat, confirmations, reviews, listing creation with a photo, and the admin area.
# Needs a freshly seeded DB and the API running; stop the Vite dev server first (it uses :5173).
cd frontend && npm install && npm run test:ui
```

**What the automated tests cover:** image rules; browse filters/sort/pagination and wildcard/SQL-injection input; request validation; competing and simultaneous accepts; transaction confirmation; exchange flows; reviews and rating average; five simultaneous equal bids (exactly one accepted); anti-sniping; auction end → winner transaction; relist/cancel; notifications; messaging privacy; reports; admin authorization, suspension, moderation cleanup.

**Manual checklist** (things only a human can judge): layout on a phone-sized screen, image quality, wording, and the full flow with two real browsers.

## Deployment (single Ubuntu server, Nginx + PM2)

1. **Server:** install Node 20+, MySQL 8, Nginx, PM2 (`npm i -g pm2`), and get a domain with HTTPS (Let's Encrypt: `certbot --nginx`). HTTPS is required because the auth cookie is `Secure` in production.
2. **Database:** create a DB user with only `SELECT, INSERT, UPDATE, DELETE` on `eduswap`; import `database/schema.sql` once (as an admin user). Do **not** run the sample seed in production. Create your admin by running `npm run seed` once with a strong `SEED_ADMIN_PASSWORD` (then delete the sample listings/students) or insert an admin user manually.
3. **Backend:**
   ```bash
   cd backend && npm ci --omit=dev
   cp .env.example .env   # NODE_ENV=production, real DB_*, long random JWT_SECRET,
                          # CLIENT_URL=https://your-domain, TRUST_PROXY=1
   pm2 start server.js --name eduswap-api && pm2 save && pm2 startup
   ```
4. **Frontend:** `cd frontend && npm ci && npm run build` → copy `dist/` to `/var/www/eduswap`.
5. **Nginx** (same origin for site, API and uploads, so cookies just work):
   ```nginx
   server {
     server_name your-domain;
     root /var/www/eduswap;
     client_max_body_size 12m;                  # 5 images x 2 MB + form fields
     location / { try_files $uri /index.html; }
     location /api/     { proxy_pass http://127.0.0.1:5000; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header Host $host; }
     location /uploads/ { proxy_pass http://127.0.0.1:5000; add_header X-Content-Type-Options nosniff; }
     # listen 443 ssl; ... (added by certbot)
   }
   ```
6. **Back up** the MySQL database **and** `backend/uploads/` regularly (e.g. nightly `mysqldump` + `rsync`).
7. **Updating:** `git pull`, `npm ci --omit=dev`, rebuild the frontend, `pm2 restart eduswap-api`. Re-import schema changes manually (there is no migration tool yet).

PaaS alternative: host the API where you can run Node + MySQL and attach a **persistent disk** for `uploads/` (or move images to object storage such as S3), and serve the built frontend from the same domain.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `Could not connect to MySQL` | check `DB_*` in `.env`, that MySQL is running, and that `schema.sql` was imported |
| `JWT_SECRET must be set … 32 characters` | set a longer secret in `.env` |
| Logged out after refresh in production | needs HTTPS (Secure cookie) and the site/API on the same domain |
| `429 Too many requests` while testing | see "Testing" for the dev-only limit overrides |
| Images 404 | the API must be reachable at `/uploads` (Vite proxy in dev, Nginx in production) |
| Everyone shares one rate limit in production | set `TRUST_PROXY=1` behind Nginx |

## Known limitations
- Messaging and notifications **poll** (5-30 s) rather than push in real time; WebSockets can be added later.
- No email verification or password reset yet; no online payments (by design for v1).
- Images are stored on local disk; use object storage if you run several servers.
- Search uses `LIKE` matching, which is fine at campus scale; switch to the `FULLTEXT` index (already created) for large catalogues.
- Rate limits are in-memory per server process.
- The UI has been exercised through automated jsdom tests, not through real-browser visual QA.
