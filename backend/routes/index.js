import { Router } from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import itemRoutes from './itemRoutes.js';
import {
  storefrontRoutes, wishlistRoutes, requestRoutes, transactionRoutes,
  conversationRoutes, notificationRoutes, reportRoutes, adminRoutes,
} from './flowRoutes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/storefront', storefrontRoutes);
router.use('/items', itemRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/requests', requestRoutes);
router.use('/transactions', transactionRoutes);
router.use('/conversations', conversationRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reports', reportRoutes);
router.use('/admin', adminRoutes);

export default router;
