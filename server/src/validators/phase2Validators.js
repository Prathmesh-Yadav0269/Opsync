import { body, param, query } from 'express-validator';
import mongoose from 'mongoose';
import { TASK_STATUS, TASK_PRIORITY } from '../models/Task.js';

export const isObjectId = (val) => mongoose.Types.ObjectId.isValid(val);

export const createUserValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 }),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('role')
    .notEmpty()
    .withMessage('Role is required')
    .isIn(['employee', 'manager', 'admin'])
    .withMessage('Role must be employee, manager, or admin'),
  body('department').optional().trim().isLength({ max: 100 }),
  body('position').optional().trim().isLength({ max: 100 }),
  body('team').optional().custom((val) => !val || isObjectId(val)).withMessage('Invalid team ID'),
];

export const updateUserValidator = [
  param('id').custom(isObjectId).withMessage('Invalid user ID parameter'),
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('role').optional().isIn(['employee', 'manager', 'admin']),
  body('department').optional().trim().isLength({ max: 100 }),
  body('position').optional().trim().isLength({ max: 100 }),
  body('team').optional().custom((val) => !val || isObjectId(val)),
];

export const updateUserStatusValidator = [
  param('id').custom(isObjectId).withMessage('Invalid user ID parameter'),
  body('isActive').isBoolean().withMessage('isActive must be a boolean value'),
];

export const createTeamValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Team name is required')
    .isLength({ min: 2, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('manager').optional({ nullable: true }).custom((val) => !val || isObjectId(val)).withMessage('Invalid manager ID'),
  body('members').optional().isArray().withMessage('Members must be an array of user IDs'),
  body('members.*').optional().custom(isObjectId).withMessage('Invalid member user ID'),
];

export const updateTeamValidator = [
  param('id').custom(isObjectId).withMessage('Invalid team ID parameter'),
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('manager').optional({ nullable: true }).custom((val) => !val || isObjectId(val)),
];

export const addTeamMemberValidator = [
  param('id').custom(isObjectId).withMessage('Invalid team ID parameter'),
  body('userId').custom(isObjectId).withMessage('Valid userId is required to add member'),
];

export const removeTeamMemberValidator = [
  param('id').custom(isObjectId).withMessage('Invalid team ID parameter'),
  param('userId').custom(isObjectId).withMessage('Valid userId is required to remove member'),
];

export const createTaskValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Task title is required')
    .isLength({ min: 2, max: 200 }),
  body('description').optional().trim().isLength({ max: 5000 }),
  body('assignedTo').custom(isObjectId).withMessage('Valid assignedTo user ID is required'),
  body('team').optional().custom((val) => !val || isObjectId(val)).withMessage('Invalid team ID'),
  body('status')
    .optional()
    .isIn(Object.values(TASK_STATUS))
    .withMessage('Invalid task status'),
  body('priority')
    .optional()
    .isIn(Object.values(TASK_PRIORITY))
    .withMessage('Invalid task priority'),
  body('dueDate').optional({ nullable: true }).isISO8601().withMessage('Invalid dueDate format'),
  body('tags').optional().isArray(),
];

export const updateTaskValidator = [
  param('id').custom(isObjectId).withMessage('Invalid task ID parameter'),
  body('title').optional().trim().isLength({ min: 2, max: 200 }),
  body('description').optional().trim().isLength({ max: 5000 }),
  body('assignedTo').optional().custom(isObjectId),
  body('status').optional().isIn(Object.values(TASK_STATUS)),
  body('priority').optional().isIn(Object.values(TASK_PRIORITY)),
  body('dueDate').optional({ nullable: true }).isISO8601(),
  body('tags').optional().isArray(),
];

export const updateTaskStatusValidator = [
  param('id').custom(isObjectId).withMessage('Invalid task ID parameter'),
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(Object.values(TASK_STATUS))
    .withMessage('Invalid task status'),
];

export const addTaskCommentValidator = [
  param('id').custom(isObjectId).withMessage('Invalid task ID parameter'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content cannot be empty')
    .isLength({ max: 2000 }),
];
