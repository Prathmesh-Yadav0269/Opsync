import { Router } from 'express';
import {
  getMyProfile,
  updateMyProfile,
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  getMySettings,
  updateMySettings,
  changePassword,
  uploadAvatar,
  getUserAvatar,
} from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { upload } from '../config/upload.js';
import { validate, updateProfileValidator } from '../validators/authValidators.js';
import {
  createUserValidator,
  updateUserValidator,
  updateUserStatusValidator,
} from '../validators/phase2Validators.js';

const router = Router();

// Self-profile & Settings routes (Phase 1 & Phase 6)
router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, validate(updateProfileValidator), updateMyProfile);
router.get('/settings', requireAuth, getMySettings);
router.patch('/settings', requireAuth, updateMySettings);
router.post('/change-password', requireAuth, changePassword);
router.post('/avatar', requireAuth, upload.single('avatar'), uploadAvatar);
router.get('/:id/avatar', getUserAvatar);

// Admin & Manager user management routes (Phase 2)
router.get('/', requireAuth, requireRole('admin', 'manager'), getUsers);
router.post('/', requireAuth, requireRole('admin'), validate(createUserValidator), createUser);
router.get('/:id', requireAuth, getUserById);
router.patch('/:id', requireAuth, requireRole('admin'), validate(updateUserValidator), updateUser);
router.patch(
  '/:id/status',
  requireAuth,
  requireRole('admin'),
  validate(updateUserStatusValidator),
  updateUserStatus
);
router.delete('/:id', requireAuth, requireRole('admin'), deleteUser);

export default router;
