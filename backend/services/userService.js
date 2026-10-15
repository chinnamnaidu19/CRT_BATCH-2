import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import AppError from '../utils/AppError.js';
import { saveImages, deleteImages } from '../utils/images.js';

export async function getPublicProfile(id) {
  const [users] = await pool.query(
    `SELECT id, full_name, college, department, academic_year, profile_image, created_at
     FROM users WHERE id = ? AND status = 'active'`, [id]);
  const u = users[0];
  if (!u) throw new AppError('Student not found', 404);

  const [listings] = await pool.query(
    `SELECT i.id, i.title, i.listing_type, i.item_condition, i.price, i.status,
            (SELECT image_path FROM item_images WHERE item_id = i.id ORDER BY sort_order, id LIMIT 1) AS cover,
            a.current_price, a.ends_at, a.bid_count
     FROM items i LEFT JOIN auctions a ON a.item_id = i.id
     WHERE i.owner_id = ? AND i.status = 'available' AND i.is_removed = 0
     ORDER BY i.created_at DESC LIMIT 12`, [id]);

  const [[tx]] = await pool.query(
    `SELECT COUNT(*) AS n FROM transactions WHERE status = 'completed' AND (requester_id = ? OR owner_id = ?)`, [id, id]);
  const [[rating]] = await pool.query('SELECT AVG(rating) AS avg, COUNT(*) AS n FROM reviews WHERE reviewee_id = ?', [id]);
  const [reviews] = await pool.query(
    `SELECT r.id, r.rating, r.comment, r.created_at, u.full_name AS reviewer_name
     FROM reviews r JOIN users u ON u.id = r.reviewer_id
     WHERE r.reviewee_id = ? ORDER BY r.created_at DESC LIMIT 10`, [id]);

  return {
    id: u.id, fullName: u.full_name, college: u.college, department: u.department,
    academicYear: u.academic_year, profileImage: u.profile_image, memberSince: u.created_at,
    completedTransactions: tx.n,
    rating: { average: rating.avg === null ? null : Math.round(Number(rating.avg) * 10) / 10, count: rating.n },
    reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, reviewerName: r.reviewer_name, createdAt: r.created_at })),
    activeListings: listings.map((l) => ({
      id: l.id, title: l.title, listingType: l.listing_type, condition: l.item_condition, status: l.status,
      price: l.price === null ? null : Number(l.price), cover: l.cover,
      auction: l.ends_at ? { currentPrice: Number(l.current_price), endsAt: l.ends_at, bidCount: l.bid_count } : null,
    })),
  };
}

export async function updateProfile(userId, { fullName, college, department, academicYear }) {
  // Email and role are deliberately not editable here.
  await pool.query('UPDATE users SET full_name=?, college=?, department=?, academic_year=? WHERE id=?',
    [fullName, college, department, academicYear, userId]);
}

export async function changePassword(userId, currentPassword, newPassword) {
  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
  const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!ok) throw new AppError('Current password is incorrect', 401);
  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
}

export async function setAvatar(userId, file) {
  if (!file) throw new AppError('Please choose an image', 400);
  const [url] = await saveImages([file], 'avatars');
  const [rows] = await pool.query('SELECT profile_image FROM users WHERE id = ?', [userId]);
  await pool.query('UPDATE users SET profile_image = ? WHERE id = ?', [url, userId]);
  if (rows[0].profile_image) await deleteImages([rows[0].profile_image]);
  return url;
}
