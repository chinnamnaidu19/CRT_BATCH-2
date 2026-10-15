import asyncHandler from '../utils/asyncHandler.js';
import * as items from '../services/itemService.js';

export const create = asyncHandler(async (req, res) => {
  const item = await items.createItem(req.user, req.body, req.files);
  res.status(201).json({ message: 'Listing published', item });
});

export const update = asyncHandler(async (req, res) => {
  const item = await items.updateItem(req.user, req.params.id, req.body, req.files);
  res.json({ message: 'Listing updated', item });
});

export const remove = asyncHandler(async (req, res) => {
  const { softDeleted } = await items.deleteItem(req.user, req.params.id);
  res.json({ message: softDeleted ? 'Listing removed (kept in history because it has requests)' : 'Listing deleted' });
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ item: await items.getItem(req.params.id, req.user || null) });
});

export const mine = asyncHandler(async (req, res) => {
  res.json({ items: await items.listByOwner(req.user.id) });
});
