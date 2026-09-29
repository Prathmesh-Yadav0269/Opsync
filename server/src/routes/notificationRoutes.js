import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getNotifications,
  markRead,
  markAllRead,
} from '../controllers/notificationController.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', getNotifications);
router.patch('/:id/read', markRead);
router.patch('/read-all', markAllRead);

export default router;
