import { body, query, param } from 'express-validator';
import { REPORT_REASONS } from '../services/reportService.js';

export const idParam = (name = 'id') => param(name).isInt({ min: 1 }).withMessage('Invalid id').toInt();

export const browseRules = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 48 }).toInt(),
  query('q').optional().isString().isLength({ max: 100 }),
  query('category').optional().isString().isLength({ max: 60 }),
  query('type').optional().isIn(['sale', 'exchange', 'auction']),
  query('condition').optional().isIn(['like_new', 'good', 'fair']),
  query('college').optional().isString().isLength({ max: 150 }),
  query('minPrice').optional().isFloat({ min: 0 }).toFloat(),
  query('maxPrice').optional().isFloat({ min: 0 }).toFloat(),
  query('sort').optional().isIn(['newest', 'price_asc', 'price_desc', 'ending_soon']),
];

export const bidRules = [body('amount').isFloat({ gt: 0, max: 10000000 }).withMessage('Enter a valid bid amount').toFloat()];
export const relistRules = [body('durationHours').isInt({ min: 1, max: 336 }).withMessage('Auction length must be 1 hour to 14 days').toInt()];

export const requestCreateRules = [
  body('itemId').isInt({ min: 1 }).withMessage('itemId is required').toInt(),
  body('type').isIn(['purchase', 'exchange']).withMessage('type must be purchase or exchange'),
  body('offeredItemId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Invalid offered item').toInt(),
  body('message').optional({ values: 'falsy' }).isString().trim().isLength({ max: 500 }).withMessage('Message can be at most 500 characters'),
];
export const requestListRules = [
  query('box').optional().isIn(['sent', 'received']),
  query('status').optional().isIn(['pending', 'accepted', 'rejected', 'cancelled', 'completed']),
];

export const reviewRules = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1 to 5 stars').toInt(),
  body('comment').optional({ values: 'falsy' }).isString().trim().isLength({ max: 1000 }).withMessage('Review can be at most 1000 characters'),
];

export const startConversationRules = [
  body('userId').isInt({ min: 1 }).withMessage('userId is required').toInt(),
  body('itemId').optional({ values: 'falsy' }).isInt({ min: 1 }).toInt(),
];
export const messageRules = [body('body').isString().trim().isLength({ min: 1, max: 2000 }).withMessage('Message must be 1-2000 characters')];

export const reportRules = [
  body('itemId').optional({ values: 'falsy' }).isInt({ min: 1 }).toInt(),
  body('userId').optional({ values: 'falsy' }).isInt({ min: 1 }).toInt(),
  body('reason').isIn(REPORT_REASONS).withMessage(`Reason must be one of: ${REPORT_REASONS.join(', ')}`),
  body('details').optional({ values: 'falsy' }).isString().trim().isLength({ max: 1000 }).withMessage('Details can be at most 1000 characters'),
];

export const adminPageRules = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('q').optional().isString().isLength({ max: 100 }),
];
export const adminUserStatusRules = [body('status').isIn(['active', 'suspended']).withMessage('status must be active or suspended')];
export const adminReportRules = [
  body('status').isIn(['resolved', 'dismissed']).withMessage('status must be resolved or dismissed'),
  body('removeListing').optional().isBoolean().toBoolean(),
];
