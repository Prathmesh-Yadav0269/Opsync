import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  getMyTodayStandup,
  getMyStandupByDate,
  updateStandupContext,
  getTeamStandup,
} from '../controllers/standupController.js';

const router = express.Router();

router.use(requireAuth);

// Employee standup
router.get('/me/today', getMyTodayStandup);
router.get('/me', getMyStandupByDate);
router.patch('/:id/context', updateStandupContext);

// Manager team standup
router.get('/team', requireRole('admin', 'manager'), getTeamStandup);

export default router;
