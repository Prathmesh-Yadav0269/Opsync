import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createMeeting,
  getMeetings,
  getMeetingById,
  endMeeting,
} from '../controllers/meetingController.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', createMeeting);
router.get('/', getMeetings);
router.get('/:id', getMeetingById);
router.patch('/:id/end', endMeeting);

export default router;
