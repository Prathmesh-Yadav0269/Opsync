import { Router } from 'express';
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  addTaskComment,
  deleteTask,
} from '../controllers/taskController.js';
import { uploadTaskFile, getTaskFiles } from '../controllers/fileController.js';
import { upload } from '../config/upload.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../validators/authValidators.js';
import {
  createTaskValidator,
  updateTaskValidator,
  updateTaskStatusValidator,
  addTaskCommentValidator,
} from '../validators/phase2Validators.js';

const router = Router();

router.get('/', requireAuth, getTasks);
router.post(
  '/',
  requireAuth,
  requireRole('admin', 'manager'),
  validate(createTaskValidator),
  createTask
);
router.get('/:id', requireAuth, getTaskById);
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin', 'manager'),
  validate(updateTaskValidator),
  updateTask
);
router.patch(
  '/:id/status',
  requireAuth,
  validate(updateTaskStatusValidator),
  updateTaskStatus
);
router.post(
  '/:id/comments',
  requireAuth,
  validate(addTaskCommentValidator),
  addTaskComment
);
router.delete('/:id', requireAuth, requireRole('admin', 'manager'), deleteTask);

// Task attachments
router.get('/:taskId/files', requireAuth, getTaskFiles);
router.post('/:taskId/files', requireAuth, upload.single('file'), uploadTaskFile);

export default router;
