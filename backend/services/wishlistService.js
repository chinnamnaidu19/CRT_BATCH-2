import pool from '../config/db.js';
import AppError from '../utils/AppError.js';
import { loadItemsByIds } from './itemService.js';

export async function listWishlist(user) {
  const [rows] = await pool.query('SELECT item_id FROM wishlist WHERE user_id = ? ORDER BY created_at DESC', [user.id]);
  return loadItemsByIds(rows.map((r) => r.item_id));
}

export async function addToWishlist(user, itemId) {
  const [rows] = await pool.query('SELECT owner_id FROM items WHERE id = ? AND is_removed = 0', [itemId]);
  if (!rows[0]) throw new AppError('Listing not found', 404);
  if (rows[0].owner_id === user.id) throw new AppError('You cannot save your own listing', 400);
  await pool.query('INSERT IGNORE INTO wishlist (user_id, item_id) VALUES (?, ?)', [user.id, itemId]);
}

export async function removeFromWishlist(user, itemId) {
  await pool.query('DELETE FROM wishlist WHERE user_id = ? AND item_id = ?', [user.id, itemId]);
}
