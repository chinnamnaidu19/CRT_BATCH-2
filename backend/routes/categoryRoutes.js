import { Router } from 'express';
import { list } from '../controllers/categoryController.js';

const router = Router();
router.get('/', list);
export default router;
