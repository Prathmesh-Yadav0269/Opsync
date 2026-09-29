import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { getIO } from '../sockets/index.js';
import { createNotification } from '../services/notificationService.js';
import { ensureTeamChatRoom, cleanupTeamChatRoom } from '../services/teamChatService.js';

/**
 * TEM-01 & TEM-04: Get list of teams
 * Admin: views all teams.
 * Manager: views ONLY their own managed team.
 * Employee: 403 Forbidden.
 */
export const getTeams = async (req, res, next) => {
  try {
    if (req.user.role === 'employee') {
      return res.status(403).json({
        success: false,
        message: 'Employees do not have access to team management.',
      });
    }

    let filter = {};
    if (req.user.role === 'manager') {
      filter.manager = req.user._id;
    }

    const teams = await Team.find(filter)
      .populate('manager', 'name email department position')
      .populate('members', 'name email department position isActive lastLogin')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: { teams },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * TEM-05: Get single team by ID with strict manager isolation
 */
export const getTeamById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user.role === 'employee') {
      return res.status(403).json({
        success: false,
        message: 'Employees do not have access to team management.',
      });
    }

    const team = await Team.findById(id)
      .populate('manager', 'name email department position')
      .populate('members', 'name email department position isActive lastLogin');

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found.',
      });
    }

    // Manager can only view their own team
    if (req.user.role === 'manager' && team.manager?._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to access this team.',
      });
    }

    res.status(200).json({
      success: true,
      data: { team },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * TEM-01: Admin creates team
 */
export const createTeam = async (req, res, next) => {
  try {
    const { name, description, manager, members } = req.body;

    const existing = await Team.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A team with this name already exists.',
      });
    }

    let managerId = null;
    if (manager) {
      const managerUser = await User.findById(manager);
      if (!managerUser) {
        return res.status(400).json({
          success: false,
          message: 'Specified manager not found.',
        });
      }
      if (managerUser.role !== 'manager') {
        return res.status(400).json({
          success: false,
          message: `User '${managerUser.name}' has role '${managerUser.role}'. Only users with 'manager' role can manage teams.`,
        });
      }
      managerId = managerUser._id;
    }

    const validatedMembers = [];
    if (Array.isArray(members) && members.length > 0) {
      for (const mId of members) {
        const memberUser = await User.findById(mId);
        if (memberUser && memberUser.role === 'employee' && !validatedMembers.includes(memberUser._id)) {
          validatedMembers.push(memberUser._id);
        }
      }
    }

    const team = await Team.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      manager: managerId,
      members: validatedMembers,
    });

    // Update User.team references
    if (managerId) {
      await User.findByIdAndUpdate(managerId, { team: team._id });
    }
    if (validatedMembers.length > 0) {
      await User.updateMany({ _id: { $in: validatedMembers } }, { team: team._id });
    }

    const populatedTeam = await Team.findById(team._id)
      .populate('manager', 'name email')
      .populate('members', 'name email');

    // Automatically create corresponding Team ChatRoom with rollback guard
    try {
      await ensureTeamChatRoom(team);
    } catch (chatError) {
      await Team.findByIdAndDelete(team._id);
      await User.updateMany({ team: team._id }, { team: null });
      throw new Error(`Failed to initialize team chat room: ${chatError.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Team created successfully.',
      data: { team: populatedTeam },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * TEM-01 & TEM-02: Admin updates team
 */
export const updateTeam = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, manager } = req.body;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found.',
      });
    }

    if (name && name.trim() !== team.name) {
      const duplicate = await Team.findOne({ name: name.trim(), _id: { $ne: id } });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: 'Another team with this name already exists.',
        });
      }
      team.name = name.trim();
    }

    if (description !== undefined) {
      team.description = description.trim();
    }

    // Manager assignment
    if (manager !== undefined) {
      if (manager === null || manager === '') {
        if (team.manager) {
          await User.findByIdAndUpdate(team.manager, { team: null });
        }
        team.manager = null;
      } else {
        const managerUser = await User.findById(manager);
        if (!managerUser) {
          return res.status(400).json({
            success: false,
            message: 'Specified manager not found.',
          });
        }
        if (managerUser.role !== 'manager') {
          return res.status(400).json({
            success: false,
            message: `User '${managerUser.name}' is an ${managerUser.role}. Only users with 'manager' role can manage teams.`,
          });
        }

        if (team.manager && team.manager.toString() !== manager.toString()) {
          await User.findByIdAndUpdate(team.manager, { team: null });
        }

        team.manager = managerUser._id;
        await User.findByIdAndUpdate(managerUser._id, { team: team._id });
      }
    }

    await team.save();

    // Synchronize Team ChatRoom membership & manager
    await ensureTeamChatRoom(team);

    const populatedTeam = await Team.findById(team._id)
      .populate('manager', 'name email department position')
      .populate('members', 'name email department position');

    res.status(200).json({
      success: true,
      message: 'Team updated successfully.',
      data: { team: populatedTeam },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * TEM-01: Admin archives/unarchives team
 */
export const toggleArchiveTeam = async (req, res, next) => {
  try {
    const { id } = req.params;
    const team = await Team.findById(id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found.',
      });
    }

    team.isArchived = !team.isArchived;
    await team.save();

    res.status(200).json({
      success: true,
      message: `Team ${team.isArchived ? 'archived' : 'restored'} successfully.`,
      data: { team },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * TEM-01: Admin safe deletion of team
 */
export const deleteTeam = async (req, res, next) => {
  try {
    const { id } = req.params;
    const team = await Team.findById(id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found.',
      });
    }

    // Referential safety: check if tasks are associated with team
    const activeTasks = await Task.countDocuments({ team: id, status: { $ne: 'Done' } });
    if (activeTasks > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete team: There are ${activeTasks} active task(s) assigned to this team. Reassign or resolve tasks first.`,
      });
    }

    // Disassociate users from team
    await User.updateMany({ team: id }, { team: null });

    // Clean associated Team ChatRoom safely
    await cleanupTeamChatRoom(id);

    await Team.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Team deleted safely.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * TEM-03 & TEM-04: Admin or own Team's Manager adds an employee to team
 */
export const addMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found.',
      });
    }

    // Manager can only modify their own team
    if (req.user.role === 'manager' && team.manager?.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only manage members of your own team.',
      });
    }

    const employee = await User.findById(userId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.',
      });
    }

    if (employee.role !== 'employee') {
      return res.status(400).json({
        success: false,
        message: 'Only accounts with role "employee" can be added as team members.',
      });
    }

    if (team.members.includes(employee._id)) {
      return res.status(400).json({
        success: false,
        message: 'Employee is already a member of this team.',
      });
    }

    // Add to members & update employee's team reference
    team.members.push(employee._id);
    await team.save();

    employee.team = team._id;
    await employee.save();

    // Synchronize Team ChatRoom membership
    await ensureTeamChatRoom(team);

    const populatedTeam = await Team.findById(team._id)
      .populate('manager', 'name email')
      .populate('members', 'name email department position');

    // Real-time notification and Socket event (NOT-03 & team:memberAdded)
    await createNotification({
      userId: employee._id,
      type: 'team_membership',
      title: 'Added to Team',
      message: `You have been added to team "${team.name}".`,
      entityType: 'Team',
      entityId: team._id,
    });

    const io = getIO();
    if (io) {
      io.to(`user:${employee._id.toString()}`).emit('team:memberAdded', {
        team: populatedTeam,
        user: employee,
      });
      io.to(`team:${team._id.toString()}`).emit('team:memberAdded', {
        team: populatedTeam,
        user: employee,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Member added to team successfully.',
      data: { team: populatedTeam },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * TEM-03 & TEM-04: Admin or own Team's Manager removes an employee from team
 */
export const removeMember = async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found.',
      });
    }

    if (req.user.role === 'manager' && team.manager?.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only manage members of your own team.',
      });
    }

    if (!team.members.some((m) => m.toString() === userId.toString())) {
      return res.status(400).json({
        success: false,
        message: 'User is not a member of this team.',
      });
    }

    team.members = team.members.filter((m) => m.toString() !== userId.toString());
    await team.save();

    await User.findByIdAndUpdate(userId, { team: null });

    // Synchronize Team ChatRoom membership
    await ensureTeamChatRoom(team);

    // Real-time notification and Socket event (NOT-03 & team:memberRemoved)
    await createNotification({
      userId,
      type: 'team_membership',
      title: 'Removed from Team',
      message: `You were removed from team "${team.name}".`,
      entityType: 'Team',
      entityId: team._id,
    });

    const io = getIO();
    if (io) {
      io.to(`user:${userId}`).emit('team:memberRemoved', {
        teamId: id,
        userId,
      });
      io.to(`team:${id}`).emit('team:memberRemoved', {
        teamId: id,
        userId,
      });

      // Evict user's active sockets from the old team room immediately
      const userSockets = io.sockets.adapter.rooms.get(`user:${userId}`);
      if (userSockets) {
        for (const socketId of userSockets) {
          const clientSocket = io.sockets.sockets.get(socketId);
          if (clientSocket) {
            clientSocket.leave(`team:${id}`);
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Member removed from team successfully.',
    });
  } catch (error) {
    next(error);
  }
};
