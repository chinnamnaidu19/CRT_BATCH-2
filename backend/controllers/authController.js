import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken, setAuthCookie, clearAuthCookie } from '../utils/jwt.js';

const BCRYPT_ROUNDS = 12;
// Lets a login for an unknown email take as long as one for a real email (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

// Never include password_hash here.
export const toPublicUser = (u) => ({
  id: u.id,
  fullName: u.full_name,
  email: u.email,
  college: u.college,
  department: u.department,
  academicYear: u.academic_year,
  profileImage: u.profile_image,
  role: u.role,
});

export const register = asyncHandler(async (req, res) => {
  const { fullName, email, college, department, academicYear, password } = req.body;

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) throw new AppError('An account with this email already exists', 409);

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // Role is never read from the request body: public sign-ups are always students.
  const [result] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, college, department, academic_year, role)
     VALUES (?, ?, ?, ?, ?, ?, 'student')`,
    [fullName, email, passwordHash, college, department, academicYear]
  );

  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
  setAuthCookie(res, signToken(result.insertId));
  res.status(201).json({ message: 'Account created successfully', user: toPublicUser(rows[0]) });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !ok) throw new AppError('Invalid email or password', 401);
  if (user.status !== 'active') throw new AppError('This account has been suspended', 403);

  setAuthCookie(res, signToken(user.id));
  res.json({ message: 'Logged in successfully', user: toPublicUser(user) });
});

export const logout = (_req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
};

export const me = (req, res) => {
  res.json({ user: toPublicUser(req.user) });
};
