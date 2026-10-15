import { body } from 'express-validator';

export const profileRules = [
  body('fullName').trim().isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters'),
  body('college').trim().isLength({ min: 2, max: 150 }).withMessage('College name is required'),
  body('department').trim().isLength({ min: 2, max: 100 }).withMessage('Department is required'),
  body('academicYear').isInt({ min: 1, max: 6 }).withMessage('Academic year must be between 1 and 6').toInt(),
];

export const passwordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Enter your current password'),
  body('newPassword')
    .isLength({ min: 8, max: 72 }).withMessage('New password must be 8-72 characters')
    .matches(/[A-Za-z]/).withMessage('New password must contain a letter')
    .matches(/\d/).withMessage('New password must contain a number'),
];
