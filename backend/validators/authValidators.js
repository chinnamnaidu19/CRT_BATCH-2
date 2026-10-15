import { body } from 'express-validator';

const password = body('password')
  .isLength({ min: 8, max: 72 }).withMessage('Password must be 8-72 characters')
  .matches(/[A-Za-z]/).withMessage('Password must contain a letter')
  .matches(/\d/).withMessage('Password must contain a number');

export const registerRules = [
  body('fullName').trim().isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters'),
  body('email').trim().toLowerCase().isEmail().withMessage('Enter a valid email address').isLength({ max: 150 }),
  body('college').trim().isLength({ min: 2, max: 150 }).withMessage('College name is required'),
  body('department').trim().isLength({ min: 2, max: 100 }).withMessage('Department is required'),
  body('academicYear').isInt({ min: 1, max: 6 }).withMessage('Academic year must be between 1 and 6').toInt(),
  password,
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),
];

export const loginRules = [
  body('email').trim().toLowerCase().isEmail().withMessage('Enter a valid email address'),
  body('password').isString().notEmpty().withMessage('Password is required'),
];
