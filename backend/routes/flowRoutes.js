import { Router } from 'express';
import * as c from '../controllers/flowControllers.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import * as v from '../validators/flowValidators.js';

const id = [v.idParam('id')];

// ---- public storefront ----
export const storefrontRoutes = Router();
storefrontRoutes.get('/', c.storefront);

// ---- wishlist ----
export const wishlistRoutes = Router();
wishlistRoutes.use(requireAuth);
wishlistRoutes.get('/', c.wishlistList);
wishlistRoutes.post('/:itemId', v.idParam('itemId'), validate, c.wishlistAdd);
wishlistRoutes.delete('/:itemId', v.idParam('itemId'), validate, c.wishlistRemove);

// ---- purchase / exchange requests ----
export const requestRoutes = Router();
requestRoutes.use(requireAuth);
requestRoutes.post('/', v.requestCreateRules, validate, c.requestCreate);
requestRoutes.get('/', v.requestListRules, validate, c.requestList);
requestRoutes.patch('/:id/accept', id, validate, c.requestAccept);
requestRoutes.patch('/:id/reject', id, validate, c.requestReject);
requestRoutes.patch('/:id/cancel', id, validate, c.requestCancel);

// ---- transactions & reviews ----
export const transactionRoutes = Router();
transactionRoutes.use(requireAuth);
transactionRoutes.get('/', c.txList);
transactionRoutes.get('/:id', id, validate, c.txGet);
transactionRoutes.patch('/:id/confirm', id, validate, c.txConfirm);
transactionRoutes.patch('/:id/cancel', id, validate, c.txCancel);
transactionRoutes.post('/:id/reviews', id, v.reviewRules, validate, c.reviewCreate);

// ---- messaging ----
export const conversationRoutes = Router();
conversationRoutes.use(requireAuth);
conversationRoutes.get('/', c.convList);
conversationRoutes.post('/', v.startConversationRules, validate, c.convStart);
conversationRoutes.get('/:id/messages', id, validate, c.convMessages);
conversationRoutes.post('/:id/messages', id, v.messageRules, validate, c.convSend);
conversationRoutes.patch('/:id/read', id, validate, c.convRead);

// ---- notifications ----
export const notificationRoutes = Router();
notificationRoutes.use(requireAuth);
notificationRoutes.get('/', c.notifList);
notificationRoutes.get('/unread-count', c.notifCount);
notificationRoutes.patch('/read-all', c.notifReadAll);          // must stay above '/:id/read'
notificationRoutes.patch('/:id/read', id, validate, c.notifRead);

// ---- reports ----
export const reportRoutes = Router();
reportRoutes.post('/', requireAuth, v.reportRules, validate, c.reportCreate);

// ---- admin: every route needs a valid session AND the admin role, enforced on the server ----
export const adminRoutes = Router();
adminRoutes.use(requireAuth, requireRole('admin'));
adminRoutes.get('/stats', c.adminStats);
adminRoutes.get('/users', v.adminPageRules, validate, c.adminUsers);
adminRoutes.patch('/users/:id/status', id, v.adminUserStatusRules, validate, c.adminUserStatus);
adminRoutes.get('/items', v.adminPageRules, validate, c.adminItems);
adminRoutes.delete('/items/:id', id, validate, c.adminItemRemove);
adminRoutes.patch('/items/:id/restore', id, validate, c.adminItemRestore);
adminRoutes.get('/requests', v.adminPageRules, validate, c.adminRequests);
adminRoutes.get('/reports', v.adminPageRules, validate, c.adminReports);
adminRoutes.patch('/reports/:id', id, v.adminReportRules, validate, c.adminReportResolve);
