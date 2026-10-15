import asyncHandler from '../utils/asyncHandler.js';
import * as users from '../services/userService.js';
import { toPublicUser } from './authController.js';
import pool from '../config/db.js';

const freshUser = async (id) => (await pool.query('SELECT * FROM users WHERE id = ?', [id]))[0][0];

export const getProfile = asyncHandler(async (req, res) => {
  res.json({ profile: await users.getPublicProfile(req.params.id) });
});

export const updateMe = asyncHandler(async (req, res) => {
  await users.updateProfile(req.user.id, req.body);
  res.json({ message: 'Profile updated', user: toPublicUser(await freshUser(req.user.id)) });
});

export const updatePassword = asyncHandler(async (req, res) => {
  await users.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
  res.json({ message: 'Password changed' });
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  await users.setAvatar(req.user.id, req.file);
  res.json({ message: 'Profile picture updated', user: toPublicUser(await freshUser(req.user.id)) });
});
