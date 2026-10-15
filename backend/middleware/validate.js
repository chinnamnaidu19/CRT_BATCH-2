import { validationResult } from 'express-validator';
import AppError from '../utils/AppError.js';

export default function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
  next(new AppError(details[0].message, 400, details));
}
