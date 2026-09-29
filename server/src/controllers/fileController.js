import path from 'path';
import fs from 'fs';
import { File } from '../models/File.js';
import { Task } from '../models/Task.js';
import { Team } from '../models/Team.js';
import { ChatRoom } from '../models/ChatRoom.js';
import { deletePhysicalFile, UPLOAD_DIR } from '../config/upload.js';
import { getIO } from '../sockets/index.js';
import { createNotification } from '../services/notificationService.js';
import { canAccessChatRoom } from '../services/teamChatService.js';

/**
 * Check whether user is authorized to access a Task's files
 */
const verifyTaskFileAccess = async (task, user) => {
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
 * POST /api/tasks/:taskId/files
 * Authorized Admin / Manager uploads an attachment to a Task
 */
export const uploadTaskFile = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded or invalid file format.',
      });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      await deletePhysicalFile(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    // Role check: Only Admin or own-team Manager may attach files to Tasks
    if (req.user.role === 'employee') {
      await deletePhysicalFile(req.file.path);
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Employees cannot attach files directly to tasks.',
      });
    }

    if (req.user.role === 'manager') {
      const managedTeam = await Team.findOne({ manager: req.user._id });
      const taskTeamId = task.team?._id ? task.team._id.toString() : task.team?.toString();
      if (!managedTeam || taskTeamId !== managedTeam._id.toString()) {
        await deletePhysicalFile(req.file.path);
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You can only attach files to tasks in your own team.',
        });
      }
    }

    // Persist File metadata in MongoDB
    const fileDoc = await File.create({
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      extension: path.extname(req.file.originalname).toLowerCase(),
      size: req.file.size,
      storagePath: req.file.path,
      uploadedBy: req.user._id,
      task: task._id,
      team: task.team,
    });

    // Update Task attachment references & append audit history
    task.attachments = task.attachments || [];
    task.attachments.push(fileDoc._id.toString());

    task.history.push({
      action: 'attachment_added',
      field: 'attachments',
      oldValue: null,
      newValue: fileDoc.originalName,
      changedBy: req.user._id,
      changedAt: new Date(),
    });

    await task.save();

    // Create persistent notification for assigned employee (NOT-03 & P4-15)
    if (task.assignedTo && task.assignedTo.toString() !== req.user._id.toString()) {
      await createNotification({
        userId: task.assignedTo,
        type: 'file_uploaded',
        title: 'New Task Attachment',
        message: `${req.user.name} attached file "${fileDoc.originalName}" to task "${task.title}".`,
        entityType: 'Task',
        entityId: task._id,
      });
    }

    // Emit live socket event to assigned user and team
    const io = getIO();
    if (io) {
      const populatedFile = await File.findById(fileDoc._id).populate(
        'uploadedBy',
        'name email role'
      );
      if (task.assignedTo) {
        io.to(`user:${task.assignedTo.toString()}`).emit('file:uploaded', {
          task: task._id,
          file: populatedFile,
        });
      }
      if (task.team) {
        io.to(`team:${task.team.toString()}`).emit('file:uploaded', {
          task: task._id,
          file: populatedFile,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'File attached to task successfully.',
      data: { file: fileDoc },
    });
  } catch (error) {
    if (req.file) {
      await deletePhysicalFile(req.file.path);
    }
    next(error);
  }
};

/**
 * POST /api/chats/:roomId/files
 * Authorized participant uploads an attachment for a ChatRoom
 */
export const uploadChatFile = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded or invalid file format.',
      });
    }

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      await deletePhysicalFile(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Chat room not found.',
      });
    }

    const hasChatAccess = await canAccessChatRoom(req.user, room);

    if (!hasChatAccess) {
      await deletePhysicalFile(req.file.path);
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You are not authorized to upload attachments to this chat room.',
      });
    }

    const fileDoc = await File.create({
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      extension: path.extname(req.file.originalname).toLowerCase(),
      size: req.file.size,
      storagePath: req.file.path,
      uploadedBy: req.user._id,
      chatRoom: room._id,
      team: room.team || null,
    });

    const populatedFile = await File.findById(fileDoc._id).populate(
      'uploadedBy',
      'name email role'
    );

    res.status(201).json({
      success: true,
      message: 'Chat attachment uploaded successfully.',
      data: { file: populatedFile },
    });
  } catch (error) {
    if (req.file) {
      await deletePhysicalFile(req.file.path);
    }
    next(error);
  }
};

/**
 * GET /api/files/:fileId/download
 * Controlled download enforcing authentication & resource-level authorization
 */
export const downloadFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found.',
      });
    }

    // 1. Task file authorization
    if (file.task) {
      const task = await Task.findById(file.task);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Associated task not found.',
        });
      }

      const hasAccess = await verifyTaskFileAccess(task, req.user);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You do not have permission to download this task attachment.',
        });
      }
    } else if (file.chatRoom) {
      // 2. Chat file authorization (must verify CURRENT authorization)
      const room = await ChatRoom.findById(file.chatRoom);
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Associated chat room not found.',
        });
      }

      const hasAccess = await canAccessChatRoom(req.user, room);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You do not have permission to download files from this chat room.',
        });
      }
    } else {
      // Direct file with no association requires uploader or admin
      if (file.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. Unauthorized file access.',
        });
      }
    }

    // Ensure physical file exists and check against path traversal
    const resolvedPath = path.resolve(file.storagePath);
    if (!resolvedPath.startsWith(UPLOAD_DIR) || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        success: false,
        message: 'Physical file not found on storage server.',
      });
    }

    // Stream download safely with user-facing original filename
    res.download(resolvedPath, file.originalName);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tasks/:taskId/files
 * List all files attached to a Task
 */
export const getTaskFiles = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    const hasAccess = await verifyTaskFileAccess(task, req.user);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to view attachments for this task.',
      });
    }

    const files = await File.find({ task: task._id })
      .populate('uploadedBy', 'name email role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: { files },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/files/:fileId
 * Controlled file deletion with physical cleanup
 */
export const deleteFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found.',
      });
    }

    // Authorization
    let canDelete = false;
    if (req.user.role === 'admin') {
      canDelete = true;
    } else if (file.task) {
      const task = await Task.findById(file.task);
      if (task && req.user.role === 'manager') {
        const managedTeam = await Team.findOne({ manager: req.user._id });
        const taskTeamId = task.team?._id ? task.team._id.toString() : task.team?.toString();
        if (managedTeam && taskTeamId === managedTeam._id.toString()) {
          canDelete = true;
        }
      }
    } else if (file.chatRoom) {
      if (file.uploadedBy.toString() === req.user._id.toString()) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You are not authorized to delete this file.',
      });
    }

    // If attached to a task, update task references and audit history
    if (file.task) {
      const task = await Task.findById(file.task);
      if (task) {
        task.attachments = (task.attachments || []).filter((id) => id.toString() !== file._id.toString());
        task.history.push({
          action: 'attachment_removed',
          field: 'attachments',
          oldValue: file.originalName,
          newValue: null,
          changedBy: req.user._id,
          changedAt: new Date(),
        });
        await task.save();
      }
    }

    // Remove physical file from disk
    await deletePhysicalFile(file.storagePath);

    // Delete DB record
    await File.findByIdAndDelete(fileId);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};
