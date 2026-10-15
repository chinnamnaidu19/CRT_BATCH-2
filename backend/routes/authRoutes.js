import { Router } from 'express';
import { register, login, logout, me } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimiters.js';
import { registerRules, loginRules } from '../validators/authValidators.js';

const router = Router();

router.post('/register', registerLimiter, registerRules, validate, register);
router.post('/login', loginLimiter, loginRules, validate, login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;
