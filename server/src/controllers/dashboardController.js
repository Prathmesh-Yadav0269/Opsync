import { User } from '../models/User.js';
import { Team } from '../models/Team.js';
import { Task, TASK_STATUS } from '../models/Task.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const role = req.user.role;
    let stats = {};
    let recentTasks = [];

    if (role === 'admin') {
      const [totalUsers, activeUsers, totalTeams, totalTasks] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        Team.countDocuments(),
        Task.countDocuments(),
      ]);

      const tasksByStatus = {};
      for (const statusVal of Object.values(TASK_STATUS)) {
        tasksByStatus[statusVal] = await Task.countDocuments({ status: statusVal });
      }

      const usersByRole = {
        admin: await User.countDocuments({ role: 'admin' }),
        manager: await User.countDocuments({ role: 'manager' }),
        employee: await User.countDocuments({ role: 'employee' }),
      };

      stats = {
        totalUsers,
        activeUsers,
        totalTeams,
        totalTasks,
        tasksByStatus,
        usersByRole,
      };

      recentTasks = await Task.find()
        .populate('assignedTo', 'name email')
        .populate('team', 'name')
        .sort({ updatedAt: -1 })
        .limit(5);
    } else if (role === 'manager') {
      const managedTeam = await Team.findOne({ manager: req.user._id });
      if (!managedTeam) {
        stats = {
          hasTeam: false,
          memberCount: 0,
          totalTasks: 0,
          tasksByStatus: {},
        };
      } else {
        const totalTasks = await Task.countDocuments({ team: managedTeam._id });
        const tasksByStatus = {};
        for (const statusVal of Object.values(TASK_STATUS)) {
          tasksByStatus[statusVal] = await Task.countDocuments({
            team: managedTeam._id,
            status: statusVal,
          });
        }

        stats = {
          hasTeam: true,
          teamName: managedTeam.name,
          memberCount: managedTeam.members.length,
          totalTasks,
          tasksByStatus,
        };

        recentTasks = await Task.find({ team: managedTeam._id })
          .populate('assignedTo', 'name email')
          .sort({ updatedAt: -1 })
          .limit(5);
      }
    } else if (role === 'employee') {
      const totalTasks = await Task.countDocuments({ assignedTo: req.user._id });
      const tasksByStatus = {};
      for (const statusVal of Object.values(TASK_STATUS)) {
        tasksByStatus[statusVal] = await Task.countDocuments({
          assignedTo: req.user._id,
          status: statusVal,
        });
      }

      stats = {
        totalTasks,
        tasksByStatus,
        doneTasks: tasksByStatus[TASK_STATUS.DONE] || 0,
        pendingTasks: totalTasks - (tasksByStatus[TASK_STATUS.DONE] || 0),
      };

      recentTasks = await Task.find({ assignedTo: req.user._id })
        .populate('team', 'name')
        .sort({ updatedAt: -1 })
        .limit(5);
    }

    res.status(200).json({
      success: true,
      data: {
        role,
        stats,
        recentTasks,
      },
    });
  } catch (error) {
    next(error);
  }
};
