import { Router } from 'express';
import { getProfile, updateMe, updatePassword, uploadAvatar } from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadAvatar as avatarUpload } from '../middleware/upload.js';
import validate from '../middleware/validate.js';
import { profileRules, passwordRules } from '../validators/userValidators.js';
import { idParam } from '../validators/itemValidators.js';

const router = Router();

router.put('/me', requireAuth, profileRules, validate, updateMe);
router.put('/me/password', requireAuth, passwordRules, validate, updatePassword);
router.post('/me/avatar', requireAuth, avatarUpload, uploadAvatar);
router.get('/:id', idParam, validate, getProfile);          // public profile: never exposes email or hash

export default router;
