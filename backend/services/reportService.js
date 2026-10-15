import pool from '../config/db.js';
import AppError from '../utils/AppError.js';

export const REPORT_REASONS = ['spam', 'inappropriate', 'fraud', 'wrong_category', 'other'];

export async function createReport(user, { itemId, userId, reason, details }) {
  if ((itemId && userId) || (!itemId && !userId)) throw new AppError('Report either a listing or a student', 400);

  if (itemId) {
    const [rows] = await pool.query('SELECT owner_id FROM items WHERE id = ? AND is_removed = 0', [itemId]);
    if (!rows[0]) throw new AppError('Listing not found', 404);
    if (rows[0].owner_id === user.id) throw new AppError('You cannot report your own listing', 400);
  } else {
    if (userId === user.id) throw new AppError('You cannot report yourself', 400);
    const [rows] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (!rows[0]) throw new AppError('Student not found', 404);
  }

  const [dup] = await pool.query(
    `SELECT id FROM reports WHERE reporter_id = ? AND status = 'open' AND ${itemId ? 'reported_item_id = ?' : 'reported_user_id = ?'}`,
    [user.id, itemId || userId]);
  if (dup.length) throw new AppError('You have already reported this and it is still under review', 409);

  const [res] = await pool.query(
    'INSERT INTO reports (reporter_id, reported_item_id, reported_user_id, reason, details) VALUES (?, ?, ?, ?, ?)',
    [user.id, itemId || null, userId || null, reason, details || null]);
  return res.insertId;
}
