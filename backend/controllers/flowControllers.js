import asyncHandler from '../utils/asyncHandler.js';
import { pageParams } from '../utils/pagination.js';
import * as items from '../services/itemService.js';
import * as auctions from '../services/auctionService.js';
import * as requests from '../services/requestService.js';
import * as tx from '../services/transactionService.js';
import * as convs from '../services/conversationService.js';
import * as notifs from '../services/notificationService.js';
import * as wishlist from '../services/wishlistService.js';
import * as reports from '../services/reportService.js';
import * as admin from '../services/adminService.js';

// ---- storefront / browse ----
export const storefront = asyncHandler(async (_req, res) => res.json(await items.storefront()));
export const browse = asyncHandler(async (req, res) => res.json(await items.browse(req.query)));
export const colleges = asyncHandler(async (_req, res) => res.json({ colleges: await items.collegeList() }));

// ---- wishlist ----
export const wishlistList = asyncHandler(async (req, res) => res.json({ items: await wishlist.listWishlist(req.user) }));
export const wishlistAdd = asyncHandler(async (req, res) => { await wishlist.addToWishlist(req.user, req.params.itemId); res.status(201).json({ message: 'Saved to wishlist' }); });
export const wishlistRemove = asyncHandler(async (req, res) => { await wishlist.removeFromWishlist(req.user, req.params.itemId); res.json({ message: 'Removed from wishlist' }); });

// ---- auctions ----
export const bidsList = asyncHandler(async (req, res) => { await auctions.finalizeIfDue(req.params.id); res.json({ bids: await auctions.getBids(req.params.id) }); });
export const bidPlace = asyncHandler(async (req, res) => {
  const result = await auctions.placeBid(req.user, req.params.id, req.body.amount);
  res.status(201).json({ message: 'Bid placed', auction: result });
});
export const auctionCancel = asyncHandler(async (req, res) => { await auctions.cancelAuction(req.user, req.params.id); res.json({ message: 'Auction cancelled' }); });
export const auctionRelist = asyncHandler(async (req, res) => { await auctions.relistAuction(req.user, req.params.id, req.body.durationHours); res.json({ message: 'Auction relisted' }); });

// ---- requests ----
export const requestCreate = asyncHandler(async (req, res) => {
  const id = await requests.createRequest(req.user, req.body);
  res.status(201).json({ message: 'Request sent', request: await requests.getRequest(req.user, id) });
});
export const requestList = asyncHandler(async (req, res) => res.json({ requests: await requests.listRequests(req.user, req.query.box, req.query.status) }));
export const requestAccept = asyncHandler(async (req, res) => { const r = await requests.acceptRequest(req.user, req.params.id); res.json({ message: 'Request accepted', ...r }); });
export const requestReject = asyncHandler(async (req, res) => { await requests.rejectRequest(req.user, req.params.id); res.json({ message: 'Request rejected' }); });
export const requestCancel = asyncHandler(async (req, res) => { await requests.cancelRequest(req.user, req.params.id); res.json({ message: 'Request cancelled' }); });

// ---- transactions & reviews ----
export const txList = asyncHandler(async (req, res) => res.json({ transactions: await tx.listTransactions(req.user) }));
export const txGet = asyncHandler(async (req, res) => res.json({ transaction: await tx.getTransaction(req.user, req.params.id) }));
export const txConfirm = asyncHandler(async (req, res) => { const r = await tx.confirmTransaction(req.user, req.params.id); res.json({ message: r.completed ? 'Transaction completed' : 'Confirmation recorded. Waiting for the other student.', ...r }); });
export const txCancel = asyncHandler(async (req, res) => { await tx.cancelTransaction(req.user, req.params.id); res.json({ message: 'Transaction cancelled' }); });
export const reviewCreate = asyncHandler(async (req, res) => { await tx.createReview(req.user, req.params.id, req.body); res.status(201).json({ message: 'Thanks for your review' }); });

// ---- conversations ----
export const convStart = asyncHandler(async (req, res) => res.status(201).json({ conversationId: await convs.startConversation(req.user, req.body) }));
export const convList = asyncHandler(async (req, res) => res.json({ conversations: await convs.listConversations(req.user) }));
export const convMessages = asyncHandler(async (req, res) => res.json(await convs.getMessages(req.user, req.params.id)));
export const convRead = asyncHandler(async (req, res) => { await convs.markConversationRead(req.user, req.params.id); res.json({ message: 'Marked as read' }); });
export const convSend = asyncHandler(async (req, res) => res.status(201).json({ message: await convs.sendMessage(req.user, req.params.id, req.body.body) }));

// ---- notifications ----
export const notifList = asyncHandler(async (req, res) => res.json({ notifications: await notifs.list(req.user.id, { unreadOnly: req.query.unread === '1' }), unread: await notifs.unreadCount(req.user.id) }));
export const notifCount = asyncHandler(async (req, res) => res.json({ unread: await notifs.unreadCount(req.user.id) }));
export const notifRead = asyncHandler(async (req, res) => { await notifs.markRead(req.user.id, req.params.id); res.json({ message: 'Marked as read' }); });
export const notifReadAll = asyncHandler(async (req, res) => { await notifs.markAllRead(req.user.id); res.json({ message: 'All notifications marked as read' }); });

// ---- reports ----
export const reportCreate = asyncHandler(async (req, res) => { await reports.createReport(req.user, req.body); res.status(201).json({ message: 'Report submitted. Thank you for helping keep EduSwap safe.' }); });

// ---- admin ----
export const adminStats = asyncHandler(async (_req, res) => res.json(await admin.getStats()));
export const adminUsers = asyncHandler(async (req, res) => res.json(await admin.listUsers({ q: req.query.q, status: req.query.status, ...pageParams(req.query) })));
export const adminUserStatus = asyncHandler(async (req, res) => { await admin.setUserStatus(req.user, req.params.id, req.body.status); res.json({ message: `Account ${req.body.status}` }); });
export const adminItems = asyncHandler(async (req, res) => res.json(await admin.listItems({ q: req.query.q, state: req.query.state, ...pageParams(req.query) })));
export const adminItemRemove = asyncHandler(async (req, res) => { await admin.removeListing(req.user, req.params.id, req.body?.reason || undefined); res.json({ message: 'Listing removed' }); });
export const adminItemRestore = asyncHandler(async (req, res) => { await admin.restoreListing(req.params.id); res.json({ message: 'Listing restored' }); });
export const adminRequests = asyncHandler(async (req, res) => res.json(await admin.listRequests({ status: req.query.status, ...pageParams(req.query) })));
export const adminReports = asyncHandler(async (req, res) => res.json(await admin.listReports({ status: req.query.status, ...pageParams(req.query) })));
export const adminReportResolve = asyncHandler(async (req, res) => { await admin.resolveReport(req.user, req.params.id, req.body); res.json({ message: 'Report updated' }); });
