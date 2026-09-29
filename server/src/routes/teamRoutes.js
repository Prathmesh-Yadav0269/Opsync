import { Router } from 'express';
import {
  getTeams,
  getTeamById,
  createTeam,
  updateTeam,
  toggleArchiveTeam,
  deleteTeam,
  addMember,
  removeMember,
} from '../controllers/teamController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../validators/authValidators.js';
import {
  createTeamValidator,
  updateTeamValidator,
  addTeamMemberValidator,
  removeTeamMemberValidator,
} from '../validators/phase2Validators.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin', 'manager'), getTeams);
router.post('/', requireAuth, requireRole('admin'), validate(createTeamValidator), createTeam);
router.get('/:id', requireAuth, requireRole('admin', 'manager'), getTeamById);
router.patch('/:id', requireAuth, requireRole('admin'), validate(updateTeamValidator), updateTeam);
router.patch('/:id/archive', requireAuth, requireRole('admin'), toggleArchiveTeam);
router.delete('/:id', requireAuth, requireRole('admin'), deleteTeam);

router.post(
  '/:id/members',
  requireAuth,
  requireRole('admin', 'manager'),
  validate(addTeamMemberValidator),
  addMember
);
router.delete(
  '/:id/members/:userId',
  requireAuth,
  requireRole('admin', 'manager'),
  validate(removeTeamMemberValidator),
  removeMember
);

export default router;
