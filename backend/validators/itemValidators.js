import { body, param } from 'express-validator';

export const idParam = [param('id').isInt({ min: 1 }).withMessage('Invalid id').toInt()];

const isAuction = body('listingType').equals('auction');
const isFixedPrice = body('listingType').isIn(['sale', 'both']);

export const itemRules = [
  body('title').trim().isLength({ min: 3, max: 150 }).withMessage('Title must be 3-150 characters'),
  body('description').trim().isLength({ min: 10, max: 2000 }).withMessage('Description must be 10-2000 characters'),
  body('categoryId').isInt({ min: 1 }).withMessage('Choose a category').toInt(),
  body('listingType').isIn(['sale', 'exchange', 'both', 'auction']).withMessage('Choose a listing type'),
  body('condition').isIn(['like_new', 'good', 'fair']).withMessage('Choose the item condition'),
  body('college').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 150 }).withMessage('College must be 2-150 characters'),
  body('price').if(isFixedPrice).isFloat({ gt: 0, max: 1000000 }).withMessage('Enter a valid price').toFloat(),
  body('startingPrice').if(isAuction).isFloat({ gt: 0, max: 1000000 }).withMessage('Enter a valid starting price').toFloat(),
  body('minIncrement').if(isAuction).optional({ values: 'falsy' }).isFloat({ gt: 0, max: 100000 }).withMessage('Enter a valid minimum bid increment').toFloat(),
  body('durationHours').if(isAuction).optional({ values: 'falsy' }).isInt({ min: 1, max: 336 }).withMessage('Auction length must be 1 hour to 14 days').toInt(),
];
