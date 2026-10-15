import pool, { withTransaction } from '../config/db.js';
import AppError from '../utils/AppError.js';
import { notify } from './notificationService.js';

const COVER = (col) => `(SELECT image_path FROM item_images WHERE item_id = ${col} ORDER BY sort_order, id LIMIT 1)`;

const TX_SELECT = `
  SELECT t.*, i.title AS item_title, ${COVER('t.item_id')} AS item_cover,
         oi.title AS off_title, ${COVER('t.offered_item_id')} AS off_cover,
         rq.full_name AS requester_name, ow.full_name AS owner_name
  FROM transactions t
  JOIN items i ON i.id = t.item_id
  LEFT JOIN items oi ON oi.id = t.offered_item_id
  JOIN users rq ON rq.id = t.requester_id
  JOIN users ow ON ow.id = t.owner_id`;

function toDto(t, viewerId, reviewedIds) {
  const iAmRequester = t.requester_id === viewerId;
  const hasReviewed = reviewedIds.has(t.id);
  return {
    id: t.id,
    type: t.transaction_type,
    status: t.status,
    agreedPrice: t.agreed_price === null ? null : Number(t.agreed_price),
    createdAt: t.created_at,
    completedAt: t.completed_at,
    item: { id: t.item_id, title: t.item_title, cover: t.item_cover },
    offeredItem: t.offered_item_id ? { id: t.offered_item_id, title: t.off_title, cover: t.off_cover } : null,
    requester: { id: t.requester_id, fullName: t.requester_name },
    owner: { id: t.owner_id, fullName: t.owner_name },
    other: iAmRequester ? { id: t.owner_id, fullName: t.owner_name } : { id: t.requester_id, fullName: t.requester_name },
    myRole: iAmRequester ? (t.transaction_type === 'exchange' ? 'requester' : 'buyer') : (t.transaction_type === 'exchange' ? 'owner' : 'seller'),
    iConfirmed: Boolean(iAmRequester ? t.requester_confirmed : t.owner_confirmed),
    otherConfirmed: Boolean(iAmRequester ? t.owner_confirmed : t.requester_confirmed),
    hasReviewed,
    canReview: t.status === 'completed' && !hasReviewed,
  };
}


/** Items are always locked before the transaction row (global lock order; see config/db.js). */
async function lockItemsOf(conn, transactionId) {
  const [pre] = await conn.query('SELECT item_id, offered_item_id FROM transactions WHERE id = ?', [transactionId]);
  if (!pre[0]) return;
  const ids = [pre[0].item_id, pre[0].offered_item_id].filter(Boolean).sort((a, b) => a - b);
  await conn.query('SELECT id FROM items WHERE id IN (?) ORDER BY id FOR UPDATE', [ids]);
}

async function reviewedSet(userId, ids) {
  if (!ids.length) return new Set();
  const [rows] = await pool.query('SELECT transaction_id FROM reviews WHERE reviewer_id = ? AND transaction_id IN (?)', [userId, ids]);
  return new Set(rows.map((r) => r.transaction_id));
}

export async function listTransactions(user) {
  const [rows] = await pool.query(`${TX_SELECT} WHERE t.requester_id = ? OR t.owner_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT 100`, [user.id, user.id]);
  const reviewed = await reviewedSet(user.id, rows.map((r) => r.id));
  return rows.map((r) => toDto(r, user.id, reviewed));
}

export async function getTransaction(user, id) {
  const [rows] = await pool.query(`${TX_SELECT} WHERE t.id = ?`, [id]);
  const t = rows[0];
  if (!t || (t.requester_id !== user.id && t.owner_id !== user.id)) throw new AppError('Transaction not found', 404);
  return toDto(t, user.id, await reviewedSet(user.id, [id]));
}

/** Each participant confirms the handover. When both have, the transaction completes and the items are closed. */
export async function confirmTransaction(user, id) {
  return withTransaction(async (conn) => {
    await lockItemsOf(conn, id);
    const [rows] = await conn.query('SELECT * FROM transactions WHERE id = ? FOR UPDATE', [id]);
    const t = rows[0];
    if (!t || (t.requester_id !== user.id && t.owner_id !== user.id)) throw new AppError('Transaction not found', 404);
    if (t.status !== 'in_progress') throw new AppError(`This transaction is already ${t.status}`, 409);

    const iAmRequester = t.requester_id === user.id;
    const myFlag = iAmRequester ? 'requester_confirmed' : 'owner_confirmed';
    const otherFlag = iAmRequester ? 'owner_confirmed' : 'requester_confirmed';
    if (t[myFlag]) throw new AppError('You have already confirmed this transaction', 409);
    const otherId = iAmRequester ? t.owner_id : t.requester_id;

    await conn.query(`UPDATE transactions SET ${myFlag} = 1 WHERE id = ?`, [id]);

    if (!t[otherFlag]) {
      await notify(conn, otherId, 'transaction_confirmed', 'Handover confirmed by the other student', `${user.full_name} confirmed the handover. Please confirm it too once it is done.`, id);
      return { status: 'in_progress', completed: false };
    }

    const itemIds = [t.item_id, t.offered_item_id].filter(Boolean);
    await conn.query(`UPDATE items SET status = ? WHERE id IN (?)`, [t.transaction_type === 'exchange' ? 'exchanged' : 'sold', itemIds]);
    await conn.query(`UPDATE transactions SET status = 'completed', completed_at = UTC_TIMESTAMP() WHERE id = ?`, [id]);
    if (t.request_id) await conn.query(`UPDATE exchange_requests SET status = 'completed' WHERE id = ?`, [t.request_id]);
    for (const uid of [t.requester_id, t.owner_id])
      await notify(conn, uid, 'transaction_completed', 'Transaction completed', 'The deal is complete. You can now rate the other student.', id);
    return { status: 'completed', completed: true };
  });
}

export async function cancelTransaction(user, id) {
  await withTransaction(async (conn) => {
    await lockItemsOf(conn, id);
    const [rows] = await conn.query('SELECT * FROM transactions WHERE id = ? FOR UPDATE', [id]);
    const t = rows[0];
    if (!t || (t.requester_id !== user.id && t.owner_id !== user.id)) throw new AppError('Transaction not found', 404);
    if (t.status !== 'in_progress') throw new AppError(`This transaction is already ${t.status}`, 409);

    await conn.query(`UPDATE transactions SET status = 'cancelled' WHERE id = ?`, [id]);
    if (t.request_id) await conn.query(`UPDATE exchange_requests SET status = 'cancelled' WHERE id = ?`, [t.request_id]);
    await conn.query(`UPDATE items SET status = 'available' WHERE id IN (?) AND status = 'reserved'`, [[t.item_id, t.offered_item_id].filter(Boolean)]);
    const otherId = t.requester_id === user.id ? t.owner_id : t.requester_id;
    await notify(conn, otherId, 'transaction_cancelled', 'Transaction cancelled', `${user.full_name} cancelled the transaction. The item is available again.`, id);
  });
}

export async function createReview(user, transactionId, { rating, comment }) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM transactions WHERE id = ? FOR UPDATE', [transactionId]);
    const t = rows[0];
    if (!t || (t.requester_id !== user.id && t.owner_id !== user.id)) throw new AppError('Transaction not found', 404);
    if (t.status !== 'completed') throw new AppError('You can only review a completed transaction', 409);
    const revieweeId = t.requester_id === user.id ? t.owner_id : t.requester_id;

    const [dup] = await conn.query('SELECT id FROM reviews WHERE transaction_id = ? AND reviewer_id = ?', [transactionId, user.id]);
    if (dup.length) throw new AppError('You have already reviewed this transaction', 409);

    const [res] = await conn.query(
      'INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [transactionId, user.id, revieweeId, rating, comment || null]);
    await notify(conn, revieweeId, 'review_received', 'You received a review', `${user.full_name} gave you ${rating} star${rating > 1 ? 's' : ''}.`, user.id);
    return res.insertId;
  });
}
