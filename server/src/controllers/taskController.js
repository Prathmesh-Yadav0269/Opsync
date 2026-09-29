import { Task, TASK_STATUS, TASK_PRIORITY } from '../models/Task.js';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { getIO } from '../sockets/index.js';
import { createNotification } from '../services/notificationService.js';

/**
 * Helper to check whether user is authorized to read/access a task
 */
const verifyTaskAccess = async (task, user) => {
  if (user.role === 'admin') return true;

  const taskTeamId = task.team?._id ? task.team._id.toString() : task.team?.toString();
  const taskAssigneeId = task.assignedTo?._id ? task.assignedTo._id.toString() : task.assignedTo?.toString();

  if (user.role === 'manager') {
    const managedTeam = await Team.findOne({ manager: user._id });
    return managedTeam && taskTeamId === managedTeam._id.toString();
  }

  if (user.role === 'employee') {
    return taskAssigneeId === user._id.toString();
  }

  return false;
};

/**
 * TSK-01/02/03 & Role-Scoped Querying: Get tasks list
 * Admin: organization-wide with filters.
 * Manager: own team only.
 * Employee: assigned to self only.
 */
export const getTasks = async (req, res, next) => {
  try {
    const { status, priority, team, assignedTo, search } = req.query;
    let filter = {};

    if (req.user.role === 'admin') {
      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (team) filter.team = team;
      if (assignedTo) filter.assignedTo = assignedTo;
    } else if (req.user.role === 'manager') {
      const managedTeam = await Team.findOne({ manager: req.user._id });
      if (!managedTeam) {
        return res.status(200).json({ success: true, data: { tasks: [] } });
      }
      filter.team = managedTeam._id;
      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (assignedTo) filter.assignedTo = assignedTo;
    } else if (req.user.role === 'employee') {
      filter.assignedTo = req.user._id;
      if (status) filter.status = status;
      if (priority) filter.priority = priority;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'name email department position')
      .populate('createdBy', 'name email')
      .populate('team', 'name')
      .populate('comments.author', 'name email role')
      .populate('history.changedBy', 'name email role')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: { tasks },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single task by ID with role authorization
 */
export const getTaskById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id)
      .populate('assignedTo', 'name email department position')
      .populate('createdBy', 'name email')
      .populate('team', 'name')
      .populate('comments.author', 'name email role')
      .populate('history.changedBy', 'name email role');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    const hasAccess = await verifyTaskAccess(task, req.user);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have access to this task.',
      });
    }

    res.status(200).json({
      success: true,
      data: { task },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * TSK-01, TSK-02, TSK-03: Create task
 * Admin: assign to Manager or Employee.
 * Manager: assign ONLY to Employees inside their own team.
 * Employee: 403 Forbidden.
 */
export const createTask = async (req, res, next) => {
  try {
    // TSK-03: Employee may NEVER assign tasks
    if (req.user.role === 'employee') {
      return res.status(403).json({
        success: false,
        message: 'Employees do not have permission to create or assign tasks.',
      });
    }

    const { title, description, assignedTo, team, status, priority, dueDate, tags } = req.body;

    const assignee = await User.findById(assignedTo);
    if (!assignee) {
      return res.status(400).json({
        success: false,
        message: 'Assignee user not found.',
      });
    }

    let targetTeam = null;

    if (req.user.role === 'manager') {
      const managedTeam = await Team.findOne({ manager: req.user._id });
      if (!managedTeam) {
        return res.status(400).json({
          success: false,
          message: 'You do not manage an active team. Only active managers can assign tasks.',
        });
      }

      // TSK-02: Manager can assign tasks ONLY to Employees inside their own team
      if (assignee.role !== 'employee') {
        return res.status(400).json({
          success: false,
          message: 'Managers can only assign tasks to employees.',
        });
      }

      const isTeamMember = managedTeam.members.some((m) => m.toString() === assignee._id.toString());
      if (!isTeamMember) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. Managers can only assign tasks to employees within their own team.',
        });
      }

      targetTeam = managedTeam;
    } else if (req.user.role === 'admin') {
      if (team) {
        targetTeam = await Team.findById(team);
        if (!targetTeam) {
          return res.status(400).json({
            success: false,
            message: 'Specified team does not exist.',
          });
        }
      } else if (assignee.team) {
        targetTeam = await Team.findById(assignee.team);
      } else {
        // Fallback: assign to primary active team or create unassigned team context
        const firstTeam = await Team.findOne();
        targetTeam = firstTeam;
      }

      if (!targetTeam) {
        return res.status(400).json({
          success: false,
          message: 'A valid team is required for task assignment. Please create a team first.',
        });
      }
    }

    const initialHistory = [
      {
        action: 'created',
        field: null,
        oldValue: null,
        newValue: 'Task created',
        changedBy: req.user._id,
        changedAt: new Date(),
      },
    ];

    const task = await Task.create({
      title: title.trim(),
      description: description ? description.trim() : '',
      createdBy: req.user._id,
      assignedTo: assignee._id,
      team: targetTeam._id,
      status: status || TASK_STATUS.TO_DO,
      priority: priority || TASK_PRIORITY.MEDIUM,
      dueDate: dueDate || null,
      tags: Array.isArray(tags) ? tags : [],
      history: initialHistory,
    });

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email department position')
      .populate('createdBy', 'name email')
      .populate('team', 'name')
      .populate('history.changedBy', 'name email role');

    // Real-time notification and Socket event (TSK-08 & NOT-01)
    await createNotification({
      userId: assignee._id,
      type: 'task_assigned',
      title: 'New Task Assigned',
      message: `You have been assigned to task: ${populatedTask.title}`,
      entityType: 'Task',
      entityId: populatedTask._id,
    });

    const io = getIO();
    if (io) {
      io.to(`user:${assignee._id.toString()}`).emit('task:assigned', populatedTask);
      if (targetTeam?._id) {
        io.to(`team:${targetTeam._id.toString()}`).emit('task:assigned', populatedTask);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Task created successfully.',
      data: { task: populatedTask },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update task with comprehensive audit history
 */
export const updateTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, assignedTo, priority, dueDate, tags } = req.body;

    // Employee cannot use general update
    if (req.user.role === 'employee') {
      return res.status(403).json({
        success: false,
        message: 'Employees cannot edit general task properties. Use status update instead.',
      });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    // Manager can only update own team's tasks
    if (req.user.role === 'manager') {
      const managedTeam = await Team.findOne({ manager: req.user._id });
      if (!managedTeam || task.team.toString() !== managedTeam._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You can only update tasks within your own team.',
        });
      }
    }

    const historyEntries = [];

    if (title && title.trim() !== task.title) {
      historyEntries.push({
        action: 'updated',
        field: 'title',
        oldValue: task.title,
        newValue: title.trim(),
        changedBy: req.user._id,
        changedAt: new Date(),
      });
      task.title = title.trim();
    }

    if (description !== undefined && description.trim() !== task.description) {
      historyEntries.push({
        action: 'updated',
        field: 'description',
        oldValue: task.description,
        newValue: description.trim(),
        changedBy: req.user._id,
        changedAt: new Date(),
      });
      task.description = description.trim();
    }

    if (priority && priority !== task.priority) {
      historyEntries.push({
        action: 'priority_changed',
        field: 'priority',
        oldValue: task.priority,
        newValue: priority,
        changedBy: req.user._id,
        changedAt: new Date(),
      });
      task.priority = priority;
    }

    if (dueDate !== undefined) {
      const oldDue = task.dueDate ? task.dueDate.toISOString() : null;
      const newDue = dueDate ? new Date(dueDate).toISOString() : null;
      if (oldDue !== newDue) {
        historyEntries.push({
          action: 'due_date_changed',
          field: 'dueDate',
          oldValue: oldDue,
          newValue: newDue,
          changedBy: req.user._id,
          changedAt: new Date(),
        });
        task.dueDate = dueDate ? new Date(dueDate) : null;
      }
    }

    if (assignedTo && assignedTo.toString() !== task.assignedTo.toString()) {
      const newAssignee = await User.findById(assignedTo);
      if (!newAssignee) {
        return res.status(400).json({
          success: false,
          message: 'New assignee user not found.',
        });
      }

      if (req.user.role === 'manager') {
        const managedTeam = await Team.findOne({ manager: req.user._id });
        const inTeam = managedTeam.members.some((m) => m.toString() === newAssignee._id.toString());
        if (!inTeam) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden. Managers can only assign tasks to employees within their own team.',
          });
        }
      }

      historyEntries.push({
        action: 'assignee_changed',
        field: 'assignedTo',
        oldValue: task.assignedTo,
        newValue: newAssignee._id,
        changedBy: req.user._id,
        changedAt: new Date(),
      });
      task.assignedTo = newAssignee._id;
    }

    if (Array.isArray(tags)) {
      task.tags = tags;
    }

    if (historyEntries.length > 0) {
      task.history.push(...historyEntries);
    }

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email department position')
      .populate('createdBy', 'name email')
      .populate('team', 'name')
      .populate('comments.author', 'name email role')
      .populate('history.changedBy', 'name email role');

    res.status(200).json({
      success: true,
      message: 'Task updated successfully.',
      data: { task: populatedTask },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update task status with audit history
 * Allowed for Admin, Manager (own team), or assigned Employee
 */
export const updateTaskStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    // Role verification
    if (req.user.role === 'employee') {
      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You can only update the status of tasks assigned to you.',
        });
      }
    } else if (req.user.role === 'manager') {
      const managedTeam = await Team.findOne({ manager: req.user._id });
      if (!managedTeam || task.team.toString() !== managedTeam._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You can only update status for tasks within your own team.',
        });
      }
    }

    if (task.status === status) {
      return res.status(200).json({
        success: true,
        message: 'Task status already matches.',
        data: { task },
      });
    }

    const oldStatus = task.status;
    task.status = status;

    // Append timestamped history record
    task.history.push({
      action: 'status_changed',
      field: 'status',
      oldValue: oldStatus,
      newValue: status,
      changedBy: req.user._id,
      changedAt: new Date(),
    });

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email department position')
      .populate('createdBy', 'name email')
      .populate('team', 'name')
      .populate('comments.author', 'name email role')
      .populate('history.changedBy', 'name email role');

    // Real-time notification and Socket event (TSK-09)
    const recipientId =
      req.user._id.toString() === task.createdBy.toString()
        ? task.assignedTo
        : task.createdBy;

    await createNotification({
      userId: recipientId,
      type: 'task_status',
      title: 'Task Status Updated',
      message: `Task "${populatedTask.title}" status was changed to "${status}" by ${req.user.name}.`,
      entityType: 'Task',
      entityId: populatedTask._id,
    });

    const io = getIO();
    if (io) {
      const teamIdStr = task.team?._id ? task.team._id.toString() : task.team?.toString();
      if (teamIdStr) {
        io.to(`team:${teamIdStr}`).emit('task:statusChanged', populatedTask);
      }
      io.to(`user:${task.createdBy.toString()}`).emit('task:statusChanged', populatedTask);
      io.to(`user:${task.assignedTo.toString()}`).emit('task:statusChanged', populatedTask);
    }

    res.status(200).json({
      success: true,
      message: `Task status updated to '${status}'.`,
      data: { task: populatedTask },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add comment to task
 */
export const addTaskComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    const hasAccess = await verifyTaskAccess(task, req.user);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have access to comment on this task.',
      });
    }

    task.comments.push({
      author: req.user._id,
      content: content.trim(),
      createdAt: new Date(),
    });

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('comments.author', 'name email role');

    res.status(201).json({
      success: true,
      message: 'Comment added successfully.',
      data: { comments: populatedTask.comments },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete task (Admin or Manager of own team)
 */
export const deleteTask = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user.role === 'employee') {
      return res.status(403).json({
        success: false,
        message: 'Employees do not have permission to delete tasks.',
      });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    if (req.user.role === 'manager') {
      const managedTeam = await Team.findOne({ manager: req.user._id });
      if (!managedTeam || task.team.toString() !== managedTeam._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You can only delete tasks belonging to your own team.',
        });
      }
    }

    await Task.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};
