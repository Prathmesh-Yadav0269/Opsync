import { Router } from 'express';
import {
  register,
  login,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import {
  validate,
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  changePasswordValidator,
} from '../validators/authValidators.js';

const router = Router();

// Public auth endpoints
router.post('/register', authLimiter, validate(registerValidator), register);
router.post('/login', authLimiter, validate(loginValidator), login);
router.post('/logout', logout);
router.post('/forgot-password', authLimiter, validate(forgotPasswordValidator), forgotPassword);
router.post('/reset-password/:token', authLimiter, validate(resetPasswordValidator), resetPassword);

// Authenticated auth endpoints
router.get('/me', requireAuth, getMe);
router.post('/change-password', requireAuth, validate(changePasswordValidator), changePassword);

// Role verification test route (Admin only)
router.get('/admin-check', requireAuth, requireRole('admin'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin authorization confirmed.',
    data: { role: req.user.role },
  });
});

export default router;
