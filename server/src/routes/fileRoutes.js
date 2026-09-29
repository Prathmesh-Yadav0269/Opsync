import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../config/upload.js';
import {
  uploadTaskFile,
  uploadChatFile,
  downloadFile,
  deleteFile,
  getTaskFiles,
} from '../controllers/fileController.js';

const router = express.Router();

router.use(requireAuth);

// Download and deletion
router.get('/:fileId/download', downloadFile);
router.delete('/:fileId', deleteFile);

// Task attachments
router.get('/tasks/:taskId', getTaskFiles);
router.post('/tasks/:taskId', upload.single('file'), uploadTaskFile);

// Chat attachments
router.post('/chats/:roomId', upload.single('file'), uploadChatFile);

export default router;
