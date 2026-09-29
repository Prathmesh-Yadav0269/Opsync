import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getChats,
  getOrCreateDirectChat,
  getTeamChat,
  getMessages,
  markMessagesRead,
} from '../controllers/chatController.js';
import { uploadChatFile } from '../controllers/fileController.js';
import { upload } from '../config/upload.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', getChats);
router.post('/direct/:userId', getOrCreateDirectChat);
router.get('/team/:teamId', getTeamChat);
router.get('/:roomId/messages', getMessages);
router.post('/:roomId/read', markMessagesRead);
router.post('/:roomId/files', upload.single('file'), uploadChatFile);

export default router;
