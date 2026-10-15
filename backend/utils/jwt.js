import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'token';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET must be set in .env and be at least 32 characters');
  }
  return s;
}

export function signToken(userId) {
  return jwt.sign({ sub: userId }, secret(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
});

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

export { COOKIE_NAME };
