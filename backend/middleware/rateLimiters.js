import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_MAX_ATTEMPTS || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.REGISTER_MAX_PER_HOUR || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sign-ups from this address. Please try again later.' },
});
