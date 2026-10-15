import pool from '../config/db.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyToken, COOKIE_NAME } from '../utils/jwt.js';

/** Requires a valid cookie; loads the *current* user row so role/suspension changes apply immediately. */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw new AppError('Authentication required', 401);

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError('Session expired. Please log in again.', 401);
  }

  const [rows] = await pool.query(
    'SELECT id, full_name, email, college, department, academic_year, profile_image, role, status FROM users WHERE id = ?',
    [payload.sub]
  );
  const user = rows[0];
  if (!user) throw new AppError('Account no longer exists', 401);
  if (user.status !== 'active') throw new AppError('This account has been suspended', 403);

  req.user = user;
  next();
});

/** Usage: router.use(requireAuth, requireRole('admin')) */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action', 403));
  }
  next();
};

/** Like requireAuth, but anonymous visitors simply continue without req.user (used on public pages). */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    const [rows] = await pool.query(
      'SELECT id, full_name, email, college, department, academic_year, profile_image, role, status FROM users WHERE id = ?', [payload.sub]);
    if (rows[0]?.status === 'active') req.user = rows[0];
  } catch { /* invalid or expired cookie: treat as anonymous */ }
  next();
});
