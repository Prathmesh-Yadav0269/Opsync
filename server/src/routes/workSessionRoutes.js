import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  getCurrentSession,
  getRecentSessions,
} from '../controllers/workSessionController.js';

const router = express.Router();

router.use(requireAuth);

router.post('/start', startSession);
router.get('/current', getCurrentSession);
router.get('/recent', getRecentSessions);
router.patch('/:id/pause', pauseSession);
router.patch('/:id/resume', resumeSession);
router.patch('/:id/stop', stopSession);

export default router;
