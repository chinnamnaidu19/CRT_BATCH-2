import { Router } from 'express';
import { create, update, remove, getOne, mine } from '../controllers/itemController.js';
import { browse, colleges, bidsList, bidPlace, auctionCancel, auctionRelist } from '../controllers/flowControllers.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { uploadItemImages } from '../middleware/upload.js';
import validate from '../middleware/validate.js';
import { itemRules, idParam as idRules } from '../validators/itemValidators.js';
import { browseRules, bidRules, relistRules } from '../validators/flowValidators.js';

const router = Router();

router.get('/', browseRules, validate, browse);                         // search / filter / sort / paginate
router.get('/colleges', colleges);                                      // for the college filter dropdown
router.get('/mine', requireAuth, mine);                                 // must stay above '/:id'
router.get('/:id', optionalAuth, idRules, validate, getOne);
router.post('/', requireAuth, uploadItemImages, itemRules, validate, create);
router.put('/:id', requireAuth, uploadItemImages, idRules, itemRules, validate, update);
router.delete('/:id', requireAuth, idRules, validate, remove);

router.get('/:id/bids', idRules, validate, bidsList);
router.post('/:id/bids', requireAuth, idRules, bidRules, validate, bidPlace);
router.post('/:id/auction/cancel', requireAuth, idRules, validate, auctionCancel);
router.post('/:id/auction/relist', requireAuth, idRules, relistRules, validate, auctionRelist);

export default router;
