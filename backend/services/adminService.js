import pool, { withTransaction } from '../config/db.js';
import AppError from '../utils/AppError.js';
import { notify } from './notificationService.js';
import { pageMeta } from '../utils/pagination.js';

const like = (t) => `%${t.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

export async function getStats() {
  const one = async (sql, p = []) => (await pool.query(sql, p))[0][0].n;
  const [byCategory] = await pool.query(
    `SELECT c.name, COUNT(i.id) AS n FROM categories c LEFT JOIN items i ON i.category_id = c.id AND i.is_removed = 0 GROUP BY c.id ORDER BY c.id`);
  const [byType] = await pool.query(`SELECT listing_type AS label, COUNT(*) AS n FROM items WHERE is_removed = 0 GROUP BY listing_type`);
  const [reqByStatus] = await pool.query(`SELECT status AS label, COUNT(*) AS n FROM exchange_requests GROUP BY status`);
  const [txByStatus] = await pool.query(`SELECT status AS label, COUNT(*) AS n FROM transactions GROUP BY status`);
  const [signups] = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS n FROM users WHERE role = 'student' AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL 13 DAY) GROUP BY DATE(created_at) ORDER BY day`);

  return {
    totals: {
      students: await one(`SELECT COUNT(*) AS n FROM users WHERE role = 'student'`),
      suspendedStudents: await one(`SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND status = 'suspended'`),
      activeListings: await one(`SELECT COUNT(*) AS n FROM items WHERE status = 'available' AND is_removed = 0`),
      liveAuctions: await one(`SELECT COUNT(*) AS n FROM auctions WHERE status = 'active' AND ends_at > UTC_TIMESTAMP()`),
      completedTransactions: await one(`SELECT COUNT(*) AS n FROM transactions WHERE status = 'completed'`),
      pendingRequests: await one(`SELECT COUNT(*) AS n FROM exchange_requests WHERE status = 'pending'`),
      reportedListings: await one(`SELECT COUNT(DISTINCT reported_item_id) AS n FROM reports WHERE status = 'open' AND reported_item_id IS NOT NULL`),
      openReports: await one(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`),
    },
    byCategory: byCategory.map((r) => ({ label: r.name, value: r.n })),
    byListingType: byType.map((r) => ({ label: r.label, value: r.n })),
    requestsByStatus: reqByStatus.map((r) => ({ label: r.label, value: r.n })),
    transactionsByStatus: txByStatus.map((r) => ({ label: r.label, value: r.n })),
    signupsLast14Days: signups.map((r) => ({ label: String(r.day instanceof Date ? r.day.toISOString().slice(0, 10) : r.day), value: r.n })),
  };
}

export async function listUsers({ q, status, page, limit }) {
  const where = ['1=1']; const params = [];
  if (q) { where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.college LIKE ?)'); params.push(like(q), like(q), like(q)); }
  if (status) { where.push('u.status = ?'); params.push(status); }
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users u WHERE ${where.join(' AND ')}`, params);
  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.college, u.department, u.role, u.status, u.created_at,
            (SELECT COUNT(*) FROM items i WHERE i.owner_id = u.id AND i.is_removed = 0) AS listing_count,
            (SELECT COUNT(*) FROM reports r WHERE r.reported_user_id = u.id AND r.status = 'open') AS open_reports
     FROM users u WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  return {
    users: rows.map((u) => ({ id: u.id, fullName: u.full_name, email: u.email, college: u.college, department: u.department, role: u.role, status: u.status, createdAt: u.created_at, listingCount: u.listing_count, openReports: u.open_reports })),
    ...pageMeta(page, limit, total),
  };
}

export async function setUserStatus(admin, userId, status) {
  if (userId === admin.id) throw new AppError('You cannot change your own account status', 400);
  const [rows] = await pool.query('SELECT id, role FROM users WHERE id = ?', [userId]);
  if (!rows[0]) throw new AppError('User not found', 404);
  if (rows[0].role === 'admin') throw new AppError('Administrator accounts cannot be suspended here', 403);
  await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
}

export async function listItems({ q, state, page, limit }) {
  const where = ['1=1']; const params = [];
  if (q) { where.push('(i.title LIKE ? OR u.full_name LIKE ?)'); params.push(like(q), like(q)); }
  if (state === 'removed') where.push('i.is_removed = 1');
  else if (state === 'reported') where.push(`EXISTS (SELECT 1 FROM reports r WHERE r.reported_item_id = i.id AND r.status = 'open')`);
  else if (state === 'active') where.push('i.is_removed = 0');
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM items i JOIN users u ON u.id = i.owner_id WHERE ${where.join(' AND ')}`, params);
  const [rows] = await pool.query(
    `SELECT i.id, i.title, i.listing_type, i.status, i.is_removed, i.created_at, u.id AS owner_id, u.full_name AS owner_name,
            (SELECT COUNT(*) FROM reports r WHERE r.reported_item_id = i.id AND r.status = 'open') AS open_reports,
            (SELECT image_path FROM item_images WHERE item_id = i.id ORDER BY sort_order, id LIMIT 1) AS cover
     FROM items i JOIN users u ON u.id = i.owner_id WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]);
  return {
    items: rows.map((i) => ({ id: i.id, title: i.title, listingType: i.listing_type, status: i.status, isRemoved: !!i.is_removed, createdAt: i.created_at, owner: { id: i.owner_id, fullName: i.owner_name }, openReports: i.open_reports, cover: i.cover })),
    ...pageMeta(page, limit, total),
  };
}

/** Takes a listing down and cleans up everything attached to it (requests, bids, an in-progress deal). */
export async function removeListing(admin, itemId, reason = 'It violated the platform rules') {
  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
    const item = rows[0];
    if (!item) throw new AppError('Listing not found', 404);
    if (item.is_removed) throw new AppError('This listing is already removed', 409);

    const [txs] = await conn.query(
      `SELECT * FROM transactions WHERE status = 'in_progress' AND (item_id = ? OR offered_item_id = ?) FOR UPDATE`, [itemId, itemId]);
    for (const t of txs) {
      await conn.query(`UPDATE transactions SET status = 'cancelled' WHERE id = ?`, [t.id]);
      if (t.request_id) await conn.query(`UPDATE exchange_requests SET status = 'cancelled' WHERE id = ?`, [t.request_id]);
      await conn.query(`UPDATE items SET status = 'available' WHERE id IN (?) AND status = 'reserved'`, [[t.item_id, t.offered_item_id].filter(Boolean)]);
      for (const uid of [t.requester_id, t.owner_id]) await notify(conn, uid, 'transaction_cancelled', 'Transaction cancelled', `A listing involved in your transaction was removed by a moderator.`, t.id);
    }

    const [pending] = await conn.query(
      `SELECT id, requester_id FROM exchange_requests WHERE status = 'pending' AND (requested_item_id = ? OR offered_item_id = ?)`, [itemId, itemId]);
    if (pending.length) {
      await conn.query(`UPDATE exchange_requests SET status = 'cancelled' WHERE id IN (?)`, [pending.map((p) => p.id)]);
      for (const p of pending) await notify(conn, p.requester_id, 'request_cancelled', 'Request cancelled', `"${item.title}" was removed by a moderator.`, p.id);
    }

    const [aucRows] = await conn.query(`SELECT id FROM auctions WHERE item_id = ? AND status = 'active'`, [itemId]);
    const auc = aucRows[0];
    if (auc) {
      await conn.query(`UPDATE auctions SET status = 'cancelled', ended_at = UTC_TIMESTAMP() WHERE id = ?`, [auc.id]);
      const [bidders] = await conn.query('SELECT DISTINCT bidder_id FROM bids WHERE auction_id = ?', [auc.id]);
      for (const b of bidders) await notify(conn, b.bidder_id, 'auction_ended', 'Auction cancelled', `"${item.title}" was removed by a moderator.`, itemId);
    }

    await conn.query('UPDATE items SET is_removed = 1 WHERE id = ?', [itemId]);
    await conn.query(`UPDATE reports SET status = 'resolved', resolved_by = ? WHERE reported_item_id = ? AND status = 'open'`, [admin.id, itemId]);
    await notify(conn, item.owner_id, 'listing_removed', 'Your listing was removed', `"${item.title}" was removed by a moderator. Reason: ${reason}.`, itemId);
  });
}

export async function restoreListing(itemId) {
  const [res] = await pool.query('UPDATE items SET is_removed = 0 WHERE id = ? AND is_removed = 1', [itemId]);
  if (!res.affectedRows) throw new AppError('Listing not found or not removed', 404);
}

export async function listRequests({ status, page, limit }) {
  const where = status ? 'WHERE r.status = ?' : '';
  const params = status ? [status] : [];
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM exchange_requests r ${where}`, params);
  const [rows] = await pool.query(
    `SELECT r.id, r.request_type, r.status, r.created_at, ri.title AS requested_title, oi.title AS offered_title,
            rq.full_name AS requester_name, ow.full_name AS owner_name
     FROM exchange_requests r JOIN items ri ON ri.id = r.requested_item_id LEFT JOIN items oi ON oi.id = r.offered_item_id
     JOIN users rq ON rq.id = r.requester_id JOIN users ow ON ow.id = r.owner_id
     ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  return {
    requests: rows.map((r) => ({ id: r.id, type: r.request_type, status: r.status, createdAt: r.created_at, requestedTitle: r.requested_title, offeredTitle: r.offered_title, requester: r.requester_name, owner: r.owner_name })),
    ...pageMeta(page, limit, total),
  };
}

export async function listReports({ status, page, limit }) {
  const where = status ? 'WHERE r.status = ?' : '';
  const params = status ? [status] : [];
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM reports r ${where}`, params);
  const [rows] = await pool.query(
    `SELECT r.*, rp.full_name AS reporter_name, i.title AS item_title, i.is_removed AS item_removed, tu.full_name AS target_user_name
     FROM reports r JOIN users rp ON rp.id = r.reporter_id
     LEFT JOIN items i ON i.id = r.reported_item_id LEFT JOIN users tu ON tu.id = r.reported_user_id
     ${where} ORDER BY (r.status = 'open') DESC, r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  return {
    reports: rows.map((r) => ({
      id: r.id, reason: r.reason, details: r.details, status: r.status, createdAt: r.created_at, reporter: r.reporter_name,
      item: r.reported_item_id ? { id: r.reported_item_id, title: r.item_title, isRemoved: !!r.item_removed } : null,
      user: r.reported_user_id ? { id: r.reported_user_id, fullName: r.target_user_name } : null,
    })),
    ...pageMeta(page, limit, total),
  };
}

export async function resolveReport(admin, id, { status, removeListing: remove }) {
  const [rows] = await pool.query('SELECT * FROM reports WHERE id = ?', [id]);
  const r = rows[0];
  if (!r) throw new AppError('Report not found', 404);
  if (r.status !== 'open') throw new AppError('This report is already closed', 409);
  if (remove && r.reported_item_id) {
    const [[it]] = await pool.query('SELECT is_removed FROM items WHERE id = ?', [r.reported_item_id]);
    if (it && !it.is_removed) await removeListing(admin, r.reported_item_id, 'Removed after a user report');
  }
  await pool.query(`UPDATE reports SET status = ?, resolved_by = ? WHERE id = ? AND status = 'open'`, [status, admin.id, id]);
}
