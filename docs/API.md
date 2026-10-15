# EduSwap REST API

Base URL: `http://localhost:5000/api` (in development the frontend proxies `/api` and `/uploads`).

**Auth:** an httpOnly cookie named `token` (JWT) is set by `register`/`login`. Send requests with credentials.
**Errors:** `{ "message": "...", "details": [{ "field": "...", "message": "..." }] }`
**Status codes:** 200 OK · 201 Created · 400 validation · 401 not logged in · 403 not allowed · 404 not found (also used when a resource exists but isn't yours, e.g. conversations, transactions) · 409 state conflict (item no longer available, already confirmed, duplicate…) · 429 rate limited · 500 generic server error.
**Auth column:** – public · 🔓 optional (adds `viewer` info) · 🔒 logged in · 👑 admin only.

## Auth
| Method | Path | Auth | Body / notes |
|---|---|---|---|
| POST | /auth/register | – | `fullName, email, college, department, academicYear (1-6), password, confirmPassword`. Always creates a student. 20/hour/IP |
| POST | /auth/login | – | `email, password`. 10 attempts / 15 min / IP |
| POST | /auth/logout | – | clears the cookie |
| GET | /auth/me | 🔒 | current user |

## Users & profiles
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /users/:id | – | public profile: listings, completed deals, rating, reviews. Never includes email or hash |
| PUT | /users/me | 🔒 | `fullName, college, department, academicYear` (email/role are ignored) |
| PUT | /users/me/password | 🔒 | `currentPassword, newPassword` |
| POST | /users/me/avatar | 🔒 | multipart, field `avatar` (JPEG/PNG/WebP, ≤2 MB) |

## Categories, storefront, browsing
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /categories | – | the 8 categories |
| GET | /storefront | – | home page data: per-category newest 8, auctions ending soon, recent |
| GET | /items | – | query: `q` (all words must match title/description), `category` (slug or id), `type` (sale\|exchange\|auction; sale/exchange include "both"), `condition`, `college`, `minPrice`, `maxPrice` (auctions use the current bid), `sort` (newest\|price_asc\|price_desc\|ending_soon), `page`, `limit` (≤48). Returns `{items, page, limit, total, totalPages}` |
| GET | /items/colleges | – | colleges with live listings |

## Listings
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /items/:id | 🔓 | full listing. When logged in adds `viewer {isOwner, inWishlist, isHighestBidder, pendingRequest}`. Closes the auction first if its time is up |
| GET | /items/mine | 🔒 | your listings |
| POST | /items | 🔒 | multipart: `title, description, categoryId, listingType (sale\|exchange\|both\|auction), condition (like_new\|good\|fair), college?`, `price` (sale/both), auction: `startingPrice, minIncrement?, durationHours (1-336)`, **`images` ×1-5 (required)** |
| PUT | /items/:id | 🔒 owner | same fields; `keepImageIds` (repeat) lists images to keep, `images` adds new ones; total 1-5. Type can't change to/from auction; auction prices freeze after the first bid |
| DELETE | /items/:id | 🔒 owner | available items only. Hidden (not erased) if it has request/bid history. Refused while an auction has bids |

## Wishlist
`GET /wishlist` · `POST /wishlist/:itemId` · `DELETE /wishlist/:itemId` (all 🔒; own items can't be saved)

## Auctions
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /items/:id/bids | – | bid history (bidder names shortened, e.g. "Ananya R.") |
| POST | /items/:id/bids | 🔒 | `{amount}`. First bid ≥ starting price, later bids ≥ current + increment. Not your own item, not if you already lead, not after the end. A bid in the last 2 minutes extends the end by 2 minutes. Concurrent bids are serialized by a row lock |
| POST | /items/:id/auction/cancel | 🔒 owner | active auctions; bidders are notified |
| POST | /items/:id/auction/relist | 🔒 owner | `{durationHours}`; only auctions that ended/cancelled with no bids |

When an auction ends (background job every 30 s, or lazily when its page is opened): with bids, the item becomes `reserved` and a transaction is created for the winner at the winning price; with no bids it simply ends.

## Purchase & exchange requests
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /requests | 🔒 | `{itemId, type: purchase\|exchange, offeredItemId (exchange), message?}`. Not your own listing, not auctions, item must be available and allow that type; offered item must be yours and available; one pending request per item per student |
| GET | /requests | 🔒 | `?box=sent\|received` (default sent), `?status=` |
| PATCH | /requests/:id/accept | 🔒 owner | reserves the item(s), creates the transaction, **auto-rejects every other pending request touching those items** (all in one DB transaction) |
| PATCH | /requests/:id/reject | 🔒 owner | pending only |
| PATCH | /requests/:id/cancel | 🔒 requester | pending only |

## Transactions & reviews
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /transactions | 🔒 | yours, with `iConfirmed`, `otherConfirmed`, `canReview` |
| GET | /transactions/:id | 🔒 participant | |
| PATCH | /transactions/:id/confirm | 🔒 participant | each side confirms once; when both have: transaction `completed`, items `sold`/`exchanged`, request `completed` |
| PATCH | /transactions/:id/cancel | 🔒 participant | in-progress only; items become available again |
| POST | /transactions/:id/reviews | 🔒 participant | `{rating 1-5, comment?}`; completed transactions only; one review per person per transaction |

## Messaging
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | /conversations | 🔒 | with last message and unread count |
| POST | /conversations | 🔒 | `{userId, itemId?}` → `{conversationId}` (reuses an existing thread) |
| GET | /conversations/:id/messages | 🔒 participant | |
| POST | /conversations/:id/messages | 🔒 participant | `{body}` 1-2000 chars |
| PATCH | /conversations/:id/read | 🔒 participant | marks the other person's messages as read |

## Notifications
`GET /notifications` (`?unread=1`) · `GET /notifications/unread-count` · `PATCH /notifications/:id/read` · `PATCH /notifications/read-all` (all 🔒, own notifications only).
Types: `request_received, request_accepted, request_rejected, request_cancelled, transaction_confirmed, transaction_completed, transaction_cancelled, new_message, review_received, bid_received, outbid, auction_won, auction_ended, listing_removed`.

## Reports
`POST /reports` 🔒 `{itemId | userId, reason: spam|inappropriate|fraud|wrong_category|other, details?}` – one open report per reporter per target.

## Admin (every route requires login **and** role `admin`, checked on the server)
| Method | Path | Notes |
|---|---|---|
| GET | /admin/stats | totals (students, active listings, completed transactions, pending requests, reported listings…) plus breakdowns |
| GET | /admin/users | `?q, status, page, limit` |
| PATCH | /admin/users/:id/status | `{status: active\|suspended}`; takes effect immediately; admins can't be suspended |
| GET | /admin/items | `?q, state=active\|reported\|removed, page, limit` |
| DELETE | /admin/items/:id | `{reason?}` removes a listing: cancels pending requests, cancels an in-progress deal (freeing the other item), cancels a live auction, notifies everyone affected |
| PATCH | /admin/items/:id/restore | |
| GET | /admin/requests | `?status, page, limit` (read-only monitoring) |
| GET | /admin/reports | `?status, page, limit` |
| PATCH | /admin/reports/:id | `{status: resolved\|dismissed, removeListing?: true}` |
