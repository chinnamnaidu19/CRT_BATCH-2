import pool from '../config/db.js';
import AppError from '../utils/AppError.js';

/** Pass a transaction connection to make the notification part of the same commit. */
export async function notify(conn, userId, type, title, body = null, relatedId = null) {
  await (conn || pool).query(
    'INSERT INTO notifications (user_id, type, title, body, related_id) VALUES (?, ?, ?, ?, ?)',
    [userId, type, title, body, relatedId]
  );
}

const dto = (n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, relatedId: n.related_id, isRead: !!n.is_read, createdAt: n.created_at });

export async function list(userId, { unreadOnly = false, limit = 50 } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''} ORDER BY created_at DESC, id DESC LIMIT ?`,
    [userId, limit]);
  return rows.map(dto);
}

export async function unreadCount(userId) {
  const [[r]] = await pool.query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
  return r.n;
}

export async function markRead(userId, id) {
  const [res] = await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
  if (!res.affectedRows) throw new AppError('Notification not found', 404);
}

export async function markAllRead(userId) {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
}
