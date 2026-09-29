import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  getMyAnalytics,
  getMyHeatmap,
  getTeamAnalytics,
  getTeamMemberAnalytics,
  getAdminAnalytics,
} from '../controllers/analyticsController.js';

const router = express.Router();

router.use(requireAuth);

// Employee personal analytics & contribution heatmap
router.get('/me', getMyAnalytics);
router.get('/me/heatmap', getMyHeatmap);

// Manager team analytics
router.get('/team', requireRole('admin', 'manager'), getTeamAnalytics);
router.get('/team/members/:userId', requireRole('admin', 'manager'), getTeamMemberAnalytics);

// Admin workspace analytics
router.get('/admin', requireRole('admin'), getAdminAnalytics);

export default router;
