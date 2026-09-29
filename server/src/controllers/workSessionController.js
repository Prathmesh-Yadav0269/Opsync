import { WorkSession } from '../models/WorkSession.js';
import { Task } from '../models/Task.js';
import { getIO } from '../sockets/index.js';

/**
 * POST /api/work-sessions/start
 * Start an active work session against an assigned task
 */
export const startSession = async (req, res, next) => {
  try {
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: 'Task ID is required to start a work session.',
      });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    // Task authorization: caller must be assigned to task
    const isAssigned =
      task.assignedTo && task.assignedTo.toString() === req.user._id.toString();

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only start a work session on a task assigned to you.',
      });
    }

    // P4-29: Reject starting session on a completed ('Done') task
    if (task.status === 'Done') {
      return res.status(400).json({
        success: false,
        message: 'Cannot start a work session on a completed task.',
      });
    }

    // P4-18: One unfinished session maximum per user (active or paused)
    const existingSession = await WorkSession.findOne({
      user: req.user._id,
      state: { $in: ['active', 'paused'] },
    });

    if (existingSession) {
      return res.status(409).json({
        success: false,
        message: 'Conflict: You already have an active or paused work session in progress.',
        data: { session: existingSession },
      });
    }

    // Server-side authoritative start timestamp
    const now = new Date();
    const session = await WorkSession.create({
      user: req.user._id,
      task: task._id,
      start: now,
      state: 'active',
      pauses: [],
      activeDuration: 0,
      interruptions: 0,
    });

    const populatedSession = await WorkSession.findById(session._id).populate(
      'task',
      'title status priority team'
    );

    const io = getIO();
    if (io) {
      io.to(`user:${req.user._id.toString()}`).emit('workSession:started', populatedSession);
    }

    res.status(201).json({
      success: true,
      message: 'Work session started successfully.',
      data: { session: populatedSession },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/work-sessions/:id/pause
 * Pause an active work session
 */
export const pauseSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await WorkSession.findById(id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Work session not found.',
      });
    }

    // Session ownership check
    if (session.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this work session.',
      });
    }

    // State machine: only 'active' can transition to 'paused'
    if (session.state !== 'active') {
      return res.status(409).json({
        success: false,
        message: `Conflict: Cannot pause a session in '${session.state}' state.`,
      });
    }

    const now = new Date();
    session.state = 'paused';
    session.pauses.push({ start: now, end: null });
    session.interruptions += 1;
    session.activeDuration = session.calculateActiveDuration(now);
    await session.save();

    const populatedSession = await WorkSession.findById(session._id).populate(
      'task',
      'title status priority team'
    );

    const io = getIO();
    if (io) {
      io.to(`user:${req.user._id.toString()}`).emit('workSession:paused', populatedSession);
    }

    res.status(200).json({
      success: true,
      message: 'Work session paused.',
      data: { session: populatedSession },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/work-sessions/:id/resume
 * Resume a paused work session
 */
export const resumeSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await WorkSession.findById(id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Work session not found.',
      });
    }

    if (session.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this work session.',
      });
    }

    // State machine: only 'paused' can transition to 'active'
    if (session.state !== 'paused') {
      return res.status(409).json({
        success: false,
        message: `Conflict: Cannot resume a session in '${session.state}' state.`,
      });
    }

    const now = new Date();
    session.state = 'active';

    // Close open pause interval
    if (session.pauses.length > 0) {
      const lastPause = session.pauses[session.pauses.length - 1];
      if (!lastPause.end) {
        lastPause.end = now;
      }
    }

    session.activeDuration = session.calculateActiveDuration(now);
    await session.save();

    const populatedSession = await WorkSession.findById(session._id).populate(
      'task',
      'title status priority team'
    );

    const io = getIO();
    if (io) {
      io.to(`user:${req.user._id.toString()}`).emit('workSession:resumed', populatedSession);
    }

    res.status(200).json({
      success: true,
      message: 'Work session resumed.',
      data: { session: populatedSession },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/work-sessions/:id/stop
 * Stop a session (from active or paused) and calculate authoritative duration
 */
export const stopSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await WorkSession.findById(id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Work session not found.',
      });
    }

    if (session.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this work session.',
      });
    }

    if (session.state === 'completed') {
      return res.status(409).json({
        success: false,
        message: 'Conflict: This work session is already completed.',
      });
    }

    const now = new Date();

    // If stopped while paused, close the open pause interval
    if (session.state === 'paused' && session.pauses.length > 0) {
      const lastPause = session.pauses[session.pauses.length - 1];
      if (!lastPause.end) {
        lastPause.end = now;
      }
    }

    session.state = 'completed';
    session.end = now;
    // Server calculates authoritative duration in seconds
    session.activeDuration = session.calculateActiveDuration(now);
    await session.save();

    const populatedSession = await WorkSession.findById(session._id).populate(
      'task',
      'title status priority team'
    );

    const io = getIO();
    if (io) {
      io.to(`user:${req.user._id.toString()}`).emit('workSession:stopped', populatedSession);
    }

    res.status(200).json({
      success: true,
      message: 'Work session completed successfully.',
      data: { session: populatedSession },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/work-sessions/current
 * Return active or paused unfinished session for current user
 */
export const getCurrentSession = async (req, res, next) => {
  try {
    const session = await WorkSession.findOne({
      user: req.user._id,
      state: { $in: ['active', 'paused'] },
    }).populate('task', 'title status priority team');

    res.status(200).json({
      success: true,
      data: { session: session || null },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/work-sessions/recent
 * Return latest 5 completed sessions for current user
 */
export const getRecentSessions = async (req, res, next) => {
  try {
    const sessions = await WorkSession.find({
      user: req.user._id,
      state: 'completed',
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('task', 'title status priority team');

    res.status(200).json({
      success: true,
      data: { sessions },
    });
  } catch (error) {
    next(error);
  }
};
