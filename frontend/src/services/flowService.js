import api from './api.js';

const data = (p) => p.then((r) => r.data);
const clean = (o = {}) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// storefront / browse
export const getStorefront = () => data(api.get('/storefront'));
export const browseItems = (params) => data(api.get('/items', { params: clean(params) }));
export const getColleges = () => data(api.get('/items/colleges')).then((r) => r.colleges);

// wishlist
export const getWishlist = () => data(api.get('/wishlist')).then((r) => r.items);
export const addToWishlist = (id) => data(api.post(`/wishlist/${id}`));
export const removeFromWishlist = (id) => data(api.delete(`/wishlist/${id}`));

// auctions
export const getBids = (id) => data(api.get(`/items/${id}/bids`)).then((r) => r.bids);
export const placeBid = (id, amount) => data(api.post(`/items/${id}/bids`, { amount }));
export const cancelAuction = (id) => data(api.post(`/items/${id}/auction/cancel`));
export const relistAuction = (id, durationHours) => data(api.post(`/items/${id}/auction/relist`, { durationHours }));

// requests
export const createRequest = (body) => data(api.post('/requests', body));
export const getRequests = (box, status) => data(api.get('/requests', { params: clean({ box, status }) })).then((r) => r.requests);
export const requestAction = (id, action) => data(api.patch(`/requests/${id}/${action}`));

// transactions + reviews
export const getTransactions = () => data(api.get('/transactions')).then((r) => r.transactions);
export const transactionAction = (id, action) => data(api.patch(`/transactions/${id}/${action}`));
export const createReview = (id, body) => data(api.post(`/transactions/${id}/reviews`, body));

// messaging
export const startConversation = (userId, itemId) => data(api.post('/conversations', clean({ userId, itemId }))).then((r) => r.conversationId);
export const getConversations = () => data(api.get('/conversations')).then((r) => r.conversations);
export const getMessages = (id) => data(api.get(`/conversations/${id}/messages`));
export const sendMessage = (id, body) => data(api.post(`/conversations/${id}/messages`, { body }));
export const markConversationRead = (id) => data(api.patch(`/conversations/${id}/read`));

// notifications
export const getNotifications = () => data(api.get('/notifications'));
export const getUnreadCount = () => data(api.get('/notifications/unread-count')).then((r) => r.unread);
export const readNotification = (id) => data(api.patch(`/notifications/${id}/read`));
export const readAllNotifications = () => data(api.patch('/notifications/read-all'));

// reports
export const createReport = (body) => data(api.post('/reports', clean(body)));

// admin
export const adminStats = () => data(api.get('/admin/stats'));
export const adminUsers = (params) => data(api.get('/admin/users', { params: clean(params) }));
export const adminSetUserStatus = (id, status) => data(api.patch(`/admin/users/${id}/status`, { status }));
export const adminItems = (params) => data(api.get('/admin/items', { params: clean(params) }));
export const adminRemoveItem = (id, reason) => data(api.delete(`/admin/items/${id}`, { data: clean({ reason }) }));
export const adminRestoreItem = (id) => data(api.patch(`/admin/items/${id}/restore`));
export const adminRequests = (params) => data(api.get('/admin/requests', { params: clean(params) }));
export const adminReports = (params) => data(api.get('/admin/reports', { params: clean(params) }));
export const adminResolveReport = (id, body) => data(api.patch(`/admin/reports/${id}`, body));
