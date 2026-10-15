import pool, { withTransaction } from '../config/db.js';
import AppError from '../utils/AppError.js';
import { notify } from './notificationService.js';

const COVER = (col) => `(SELECT image_path FROM item_images WHERE item_id = ${col} ORDER BY sort_order, id LIMIT 1)`;

const REQ_SELECT = `
  SELECT r.*, ri.title AS req_title, ri.price AS req_price, ri.status AS req_status, ${COVER('r.requested_item_id')} AS req_cover,
         oi.title AS off_title, oi.price AS off_price, ${COVER('r.offered_item_id')} AS off_cover,
         rq.full_name AS requester_name, ow.full_name AS owner_name, t.id AS transaction_id
  FROM exchange_requests r
  JOIN items ri ON ri.id = r.requested_item_id
  LEFT JOIN items oi ON oi.id = r.offered_item_id
  JOIN users rq ON rq.id = r.requester_id
  JOIN users ow ON ow.id = r.owner_id
  LEFT JOIN transactions t ON t.request_id = r.id`;

const toDto = (r) => ({
  id: r.id,
  type: r.request_type,
  status: r.status,
  message: r.message,
  createdAt: r.created_at,
  requester: { id: r.requester_id, fullName: r.requester_name },
  owner: { id: r.owner_id, fullName: r.owner_name },
  requestedItem: { id: r.requested_item_id, title: r.req_title, price: r.req_price === null ? null : Number(r.req_price), cover: r.req_cover, status: r.req_status },
  offeredItem: r.offered_item_id ? { id: r.offered_item_id, title: r.off_title, price: r.off_price === null ? null : Number(r.off_price), cover: r.off_cover } : null,
  transactionId: r.transaction_id,
});

/** Locks item rows in ascending id order (a fixed order prevents deadlocks between concurrent requests). */
async function lockItems(conn, ids) {
  const unique = [...new Set(ids.filter(Boolean))].sort((a, b) => a - b);
  const [rows] = await conn.query('SELECT * FROM items WHERE id IN (?) ORDER BY id FOR UPDATE', [unique]);
  return new Map(rows.map((r) => [r.id, r]));
}

export async function createRequest(user, { itemId, type, offeredItemId, message }) {
  return withTransaction(async (conn) => {
    const items = await lockItems(conn, [itemId, offeredItemId]);
    const item = items.get(itemId);
    if (!item || item.is_removed) throw new AppError('Listing not found', 404);
    if (item.owner_id === user.id) throw new AppError('You cannot request your own listing', 400);
    if (item.listing_type === 'auction') throw new AppError('Auction items can only be won by bidding', 400);
    if (item.status !== 'available') throw new AppError('This item is no longer available', 409);

    if (type === 'purchase' && !['sale', 'both'].includes(item.listing_type)) throw new AppError('This item is not for sale', 400);
    if (type === 'exchange') {
      if (!['exchange', 'both'].includes(item.listing_type)) throw new AppError('This item is not open to exchange', 400);
      if (!offeredItemId) throw new AppError('Choose one of your items to offer', 400);
      const offered = items.get(offeredItemId);
      if (!offered || offered.is_removed || offered.owner_id !== user.id) throw new AppError('You can only offer your own items', 400);
      if (offered.id === item.id) throw new AppError('You cannot offer the item you are requesting', 400);
      if (offered.listing_type === 'auction') throw new AppError('An auction item cannot be offered in an exchange', 400);
      if (offered.status !== 'available') throw new AppError('The item you offered is no longer available', 409);
    } else if (offeredItemId) {
      throw new AppError('A purchase request cannot include an offered item', 400);
    }

    const [owner] = await conn.query("SELECT id FROM users WHERE id = ? AND status = 'active'", [item.owner_id]);
    if (!owner.length) throw new AppError('The seller is not available', 409);

    const [dup] = await conn.query(
      `SELECT id FROM exchange_requests WHERE requester_id = ? AND requested_item_id = ? AND status = 'pending' LIMIT 1`, [user.id, itemId]);
    if (dup.length) throw new AppError('You already have a pending request for this item', 409);

    const [res] = await conn.query(
      `INSERT INTO exchange_requests (request_type, requester_id, owner_id, requested_item_id, offered_item_id, message)
       VALUES (?, ?, ?, ?, ?, ?)`, [type, user.id, item.owner_id, itemId, type === 'exchange' ? offeredItemId : null, message || null]);

    await notify(conn, item.owner_id, 'request_received',
      type === 'exchange' ? 'New exchange request' : 'New purchase request',
      `${user.full_name} sent a ${type} request for "${item.title}".`, res.insertId);
    return res.insertId;
  });
}

export async function listRequests(user, box = 'sent', status) {
  const col = box === 'received' ? 'r.owner_id' : 'r.requester_id';
  const [rows] = await pool.query(
    `${REQ_SELECT} WHERE ${col} = ? ${status ? 'AND r.status = ?' : ''} ORDER BY r.created_at DESC, r.id DESC LIMIT 100`,
    status ? [user.id, status] : [user.id]);
  return rows.map(toDto);
}

export async function getRequest(user, id) {
  const [rows] = await pool.query(`${REQ_SELECT} WHERE r.id = ?`, [id]);
  const r = rows[0];
  if (!r || (r.requester_id !== user.id && r.owner_id !== user.id)) throw new AppError('Request not found', 404);
  return toDto(r);
}

/** Accepting is the critical step: it reserves the item(s), creates the transaction, and rejects competing requests. */
export async function acceptRequest(user, id) {
  const transactionId = await withTransaction(async (conn) => {
    // Lock order: items first, then the request row. The same order is used everywhere, so two
    // owners accepting competing requests at the same moment queue up instead of deadlocking.
    const [pre] = await conn.query('SELECT requested_item_id, offered_item_id FROM exchange_requests WHERE id = ?', [id]);
    if (!pre[0]) throw new AppError('Request not found', 404);
    const items = await lockItems(conn, [pre[0].requested_item_id, pre[0].offered_item_id]);

    const [reqs] = await conn.query('SELECT * FROM exchange_requests WHERE id = ? FOR UPDATE', [id]);
    const r = reqs[0];
    if (r.owner_id !== user.id) throw new AppError('Only the listing owner can accept this request', 403);
    if (r.status !== 'pending') throw new AppError(`This request is already ${r.status}`, 409);

    const item = items.get(r.requested_item_id);
    const offered = r.offered_item_id ? items.get(r.offered_item_id) : null;
    if (!item || item.is_removed || item.status !== 'available') throw new AppError('This item is no longer available', 409);
    if (r.request_type === 'exchange' && (!offered || offered.is_removed || offered.status !== 'available' || offered.owner_id !== r.requester_id))
      throw new AppError('The item offered in this exchange is no longer available', 409);

    const ids = [item.id, offered?.id].filter(Boolean);
    await conn.query(`UPDATE items SET status = 'reserved' WHERE id IN (?)`, [ids]);
    await conn.query(`UPDATE exchange_requests SET status = 'accepted' WHERE id = ?`, [id]);
    const [t] = await conn.query(
      `INSERT INTO transactions (request_id, transaction_type, requester_id, owner_id, item_id, offered_item_id, agreed_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, r.request_type, r.requester_id, r.owner_id, item.id, offered?.id || null, r.request_type === 'purchase' ? item.price : null]);

    // Every other pending request touching these items can no longer be fulfilled.
    const [others] = await conn.query(
      `SELECT r.id, r.requester_id, i.title FROM exchange_requests r JOIN items i ON i.id = r.requested_item_id
       WHERE r.status = 'pending' AND r.id <> ? AND (r.requested_item_id IN (?) OR r.offered_item_id IN (?))`, [id, ids, ids]);
    if (others.length) {
      await conn.query(`UPDATE exchange_requests SET status = 'rejected' WHERE id IN (?)`, [others.map((o) => o.id)]);
      for (const o of others) await notify(conn, o.requester_id, 'request_rejected', 'Request declined', `"${o.title}" is no longer available.`, o.id);
    }
    await notify(conn, r.requester_id, 'request_accepted', 'Request accepted',
      `Your request for "${item.title}" was accepted. Arrange the handover and confirm it in Transactions.`, t.insertId);
    return t.insertId;
  });
  return { transactionId };
}

export async function rejectRequest(user, id) {
  await withTransaction(async (conn) => {
    const [reqs] = await conn.query(
      `SELECT r.*, i.title FROM exchange_requests r JOIN items i ON i.id = r.requested_item_id WHERE r.id = ? FOR UPDATE`, [id]);
    const r = reqs[0];
    if (!r) throw new AppError('Request not found', 404);
    if (r.owner_id !== user.id) throw new AppError('Only the listing owner can reject this request', 403);
    if (r.status !== 'pending') throw new AppError(`This request is already ${r.status}`, 409);
    await conn.query(`UPDATE exchange_requests SET status = 'rejected' WHERE id = ?`, [id]);
    await notify(conn, r.requester_id, 'request_rejected', 'Request declined', `Your request for "${r.title}" was declined.`, id);
  });
}

export async function cancelRequest(user, id) {
  await withTransaction(async (conn) => {
    const [reqs] = await conn.query(
      `SELECT r.*, i.title FROM exchange_requests r JOIN items i ON i.id = r.requested_item_id WHERE r.id = ? FOR UPDATE`, [id]);
    const r = reqs[0];
    if (!r) throw new AppError('Request not found', 404);
    if (r.requester_id !== user.id) throw new AppError('Only the person who sent the request can cancel it', 403);
    if (r.status !== 'pending') throw new AppError('Only pending requests can be cancelled', 409);
    await conn.query(`UPDATE exchange_requests SET status = 'cancelled' WHERE id = ?`, [id]);
    await notify(conn, r.owner_id, 'request_cancelled', 'Request cancelled', `${user.full_name} cancelled their request for "${r.title}".`, id);
  });
}
