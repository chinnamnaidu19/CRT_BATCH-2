import pool from '../config/db.js';
import asyncHandler from '../utils/asyncHandler.js';

export const list = asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT id, name, slug FROM categories ORDER BY id');
  res.json({ categories: rows });
});
