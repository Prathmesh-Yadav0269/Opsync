import fs from 'fs';
import path from 'path';
import { User } from '../models/User.js';
import { Team } from '../models/Team.js';
import { Task } from '../models/Task.js';

/**
 * Get authenticated user's own profile (Phase 1)
 */
export const getMyProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('team', 'name');
    res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update authenticated user's own profile (Phase 1 whitelist)
 */
export const updateMyProfile = async (req, res, next) => {
  try {
    const { name, department, position, theme } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (typeof name === 'string' && name.trim()) {
      user.name = name.trim();
    }
    if (typeof department === 'string') {
      user.department = department.trim();
    }
    if (typeof position === 'string') {
      user.position = position.trim();
    }
    if (theme && ['light', 'dark', 'system'].includes(theme)) {
      if (!user.settings) user.settings = {};
      user.settings.theme = theme;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * USR-01 & USR-03: View users list
 * Admin: views all users with filtering and search.
 * Manager: views ONLY members of their own team.
 * Employee: forbidden (403).
 */
export const getUsers = async (req, res, next) => {
  try {
    const { role, search, team, isActive } = req.query;

    if (req.user.role === 'employee') {
      return res.status(403).json({
        success: false,
        message: 'Employees can only access their own profile.',
      });
    }

    let filter = {};

    if (req.user.role === 'manager') {
      // Find team managed by this manager
      const managedTeam = await Team.findOne({ manager: req.user._id });
      if (!managedTeam) {
        return res.status(200).json({
          success: true,
          data: { users: [] },
        });
      }
      // Manager views only own team members + self
      filter._id = { $in: [...managedTeam.members, req.user._id] };
    } else if (req.user.role === 'admin') {
      if (role) filter.role = role;
      if (team) filter.team = team;
      if (typeof isActive !== 'undefined') filter.isActive = isActive === 'true';
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .populate('team', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: { users },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user by ID with authorization check
 */
export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user.role === 'employee' && req.user._id.toString() !== id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own user profile.',
      });
    }

    if (req.user.role === 'manager' && req.user._id.toString() !== id) {
      const managedTeam = await Team.findOne({ manager: req.user._id });
      const isMember = managedTeam?.members.some((m) => m.toString() === id);
      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view members of your own team.',
        });
      }
    }

    const user = await User.findById(id).populate('team', 'name');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin creates user (Manager, Employee, or Admin)
 */
export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, department, position, team } = req.body;

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email address already exists.',
      });
    }

    // Verify team exists if provided
    let teamDoc = null;
    if (team) {
      teamDoc = await Team.findById(team);
      if (!teamDoc) {
        return res.status(400).json({
          success: false,
          message: 'Specified team does not exist.',
        });
      }
    }

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role,
      department: department ? department.trim() : '',
      position: position ? position.trim() : '',
      team: teamDoc ? teamDoc._id : null,
      isActive: true,
    });

    // If assigned to a team, sync membership
    if (teamDoc) {
      if (role === 'manager') {
        teamDoc.manager = newUser._id;
      } else {
        if (!teamDoc.members.includes(newUser._id)) {
          teamDoc.members.push(newUser._id);
        }
      }
      await teamDoc.save();
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      data: { user: newUser },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin edits user details & role
 */
export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, role, department, position, team } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (name) user.name = name.trim();
    if (department !== undefined) user.department = department.trim();
    if (position !== undefined) user.position = position.trim();

    // Role change handling
    if (role && ['employee', 'manager', 'admin'].includes(role)) {
      user.role = role;
    }

    // Team assignment change
    if (team !== undefined) {
      const oldTeamId = user.team;

      if (team === null || team === '') {
        // Remove from current team
        if (oldTeamId) {
          await Team.findByIdAndUpdate(oldTeamId, {
            $pull: { members: user._id },
          });
        }
        user.team = null;
      } else {
        const targetTeam = await Team.findById(team);
        if (!targetTeam) {
          return res.status(400).json({
            success: false,
            message: 'Target team does not exist.',
          });
        }

        if (oldTeamId && oldTeamId.toString() !== team.toString()) {
          await Team.findByIdAndUpdate(oldTeamId, {
            $pull: { members: user._id },
          });
        }

        if (user.role === 'manager') {
          targetTeam.manager = user._id;
        } else {
          if (!targetTeam.members.includes(user._id)) {
            targetTeam.members.push(user._id);
          }
        }
        await targetTeam.save();
        user.team = targetTeam._id;
      }
    }

    await user.save();

    const populatedUser = await User.findById(user._id).populate('team', 'name');

    res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      data: { user: populatedUser },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin toggles user active status (USR-01)
 */
export const updateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Prevent deactivating own admin account
    if (req.user._id.toString() === id && !isActive) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account.',
      });
    }

    user.isActive = isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User account has been ${isActive ? 'activated' : 'deactivated'}.`,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin safe deletion of user with referential integrity protection
 */
export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user._id.toString() === id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account.',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Check if user is manager of an active team
    const managingTeam = await Team.findOne({ manager: user._id });
    if (managingTeam) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete user: They are currently assigned as Manager of team "${managingTeam.name}". Please reassign the team manager first.`,
      });
    }

    // Check if user has active tasks assigned
    const activeTasksCount = await Task.countDocuments({
      assignedTo: user._id,
      status: { $ne: 'Done' },
    });

    if (activeTasksCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete user: They have ${activeTasksCount} active assigned task(s). Please reassign their tasks first.`,
      });
    }

    // Safely remove user from any team member arrays
    if (user.team) {
      await Team.findByIdAndUpdate(user.team, {
        $pull: { members: user._id },
      });
    }

    await User.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'User deleted safely.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/settings
 * Retrieve user settings & preferences
 */
export const getMySettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('team', 'name');
    res.status(200).json({
      success: true,
      data: {
        settings: user.settings,
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/users/settings
 * Update user settings & preferences
 */
export const updateMySettings = async (req, res, next) => {
  try {
    const { theme, notifications } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (!user.settings) user.settings = {};

    if (theme && ['light', 'dark', 'system'].includes(theme)) {
      user.settings.theme = theme;
    }

    if (notifications && typeof notifications === 'object') {
      if (!user.settings.notifications) user.settings.notifications = {};
      const validKeys = ['taskAssignments', 'taskDeadlines', 'messages', 'fileUploads', 'teamMembership'];
      validKeys.forEach((k) => {
        if (typeof notifications[k] === 'boolean') {
          user.settings.notifications[k] = notifications[k];
        }
      });
    }

    user.markModified('settings');
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully.',
      data: {
        settings: user.settings,
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/change-password
 * Secure password change verifying current password
 */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long.',
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect current password.',
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/avatar
 * Upload and update user avatar image
 */
export const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No avatar image uploaded.',
      });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(415).json({
        success: false,
        message: 'Unsupported file type. Avatar must be PNG, JPG, or WEBP.',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Delete old avatar if existing
    if (user.avatar && fs.existsSync(user.avatar)) {
      try {
        fs.unlinkSync(user.avatar);
      } catch (e) {
        // ignore unlink error
      }
    }

    // Update avatar with safe stored path
    user.avatar = req.file.path;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Avatar uploaded successfully.',
      data: {
        avatar: req.file.filename,
        user,
      },
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    next(error);
  }
};

/**
 * GET /api/users/:id/avatar
 * Securely stream user avatar image
 */
export const getUserAvatar = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.avatar || !fs.existsSync(user.avatar)) {
      return res.status(404).json({
        success: false,
        message: 'Avatar not found.',
      });
    }
    res.sendFile(path.resolve(user.avatar));
  } catch (error) {
    next(error);
  }
};
