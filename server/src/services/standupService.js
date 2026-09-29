import { StandupEntry } from '../models/StandupEntry.js';
import { Task } from '../models/Task.js';
import { WorkSession } from '../models/WorkSession.js';
import { User } from '../models/User.js';
import { Team } from '../models/Team.js';

/**
 * Generate or refresh a deterministic daily standup for a user
 */
export const generateUserStandup = async (userId, targetDateStr) => {
  const baseDate = targetDateStr ? new Date(targetDateStr) : new Date();
  if (isNaN(baseDate.getTime())) {
    throw new Error('Invalid date provided for standup digest.');
  }

  const dateKey = baseDate.toISOString().split('T')[0];
  const startOfDay = new Date(`${dateKey}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateKey}T23:59:59.999Z`);

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found.');
  }

  // 1. Completed tasks transitioned to Done on this date (via Task.history)
  const completedTasksRaw = await Task.find({
    assignedTo: user._id,
    history: {
      $elemMatch: {
        action: 'status_changed',
        newValue: 'Done',
        changedAt: { $gte: startOfDay, $lte: endOfDay },
      },
    },
  });

  const completedTasks = completedTasksRaw.map((t) => {
    // Find the latest transition to Done on this date
    const doneEvent = [...t.history]
      .reverse()
      .find(
        (h) =>
          h.action === 'status_changed' &&
          h.newValue === 'Done' &&
          new Date(h.changedAt) >= startOfDay &&
          new Date(h.changedAt) <= endOfDay
      );

    return {
      _id: t._id,
      title: t.title,
      priority: t.priority,
      completedAt: doneEvent ? doneEvent.changedAt : t.updatedAt,
    };
  });

  // 2. In-Progress and Review tasks currently relevant
  const inProgressRaw = await Task.find({
    assignedTo: user._id,
    status: { $in: ['In Progress', 'Review'] },
  });

  const inProgressTasks = await Promise.all(
    inProgressRaw.map(async (t) => {
      // Calculate work session hours logged on this task today
      const sessions = await WorkSession.find({
        user: user._id,
        task: t._id,
        start: { $gte: startOfDay, $lte: endOfDay },
        state: 'completed',
      });
      const taskSec = sessions.reduce((acc, s) => acc + (s.activeDuration || 0), 0);

      return {
        _id: t._id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        hoursLogged: parseFloat((taskSec / 3600).toFixed(2)),
      };
    })
  );

  // 3. Blockers (genuine tasks with Blocked status; no invented reasons)
  const blockersRaw = await Task.find({
    assignedTo: user._id,
    status: 'Blocked',
  });

  const blockers = blockersRaw.map((t) => ({
    _id: t._id,
    title: t.title,
    priority: t.priority,
  }));

  // 4. Work Sessions logged on this day
  const daySessions = await WorkSession.find({
    user: user._id,
    start: { $gte: startOfDay, $lte: endOfDay },
    state: 'completed',
  });

  const totalDuration = daySessions.reduce((acc, s) => acc + (s.activeDuration || 0), 0);
  const totalInterruptions = daySessions.reduce((acc, s) => acc + (s.interruptions || 0), 0);

  // 5. Idempotent upsert preserving userContext
  let standup = await StandupEntry.findOne({ user: user._id, dateKey });

  if (standup) {
    standup.team = user.team || null;
    standup.completedTasks = completedTasks;
    standup.inProgressTasks = inProgressTasks;
    standup.blockers = blockers;
    standup.activeDuration = totalDuration;
    standup.interruptions = totalInterruptions;
    await standup.save();
  } else {
    standup = await StandupEntry.create({
      user: user._id,
      team: user.team || null,
      dateKey,
      completedTasks,
      inProgressTasks,
      blockers,
      activeDuration: totalDuration,
      interruptions: totalInterruptions,
      userContext: '',
    });
  }

  return StandupEntry.findById(standup._id).populate('user', 'name email role department position');
};

/**
 * Update optional user context for a standup entry
 */
export const updateUserContext = async (userId, standupId, userContext = '') => {
  const standup = await StandupEntry.findById(standupId);
  if (!standup) {
    const err = new Error('Standup entry not found.');
    err.statusCode = 404;
    throw err;
  }

  if (standup.user.toString() !== userId.toString()) {
    const err = new Error('Forbidden. You can only update context on your own standup.');
    err.statusCode = 403;
    throw err;
  }

  standup.userContext = (userContext || '').trim();
  await standup.save();

  return StandupEntry.findById(standup._id).populate('user', 'name email role department position');
};

/**
 * Get Team Standup digest for all members of the manager's team
 */
export const getTeamStandup = async (managerId, targetDateStr) => {
  const team = await Team.findOne({ manager: managerId }).populate(
    'members',
    'name email role department position'
  );

  if (!team) {
    return {
      hasTeam: false,
      message: 'No managed team assigned to current manager.',
      members: [],
    };
  }

  const baseDate = targetDateStr ? new Date(targetDateStr) : new Date();
  const dateKey = baseDate.toISOString().split('T')[0];

  // Fetch or generate standup for each team member
  const allUsers = [
    await User.findById(managerId).select('name email role department position'),
    ...(team.members || []),
  ].filter(Boolean);

  const digests = await Promise.all(
    allUsers.map(async (u) => {
      try {
        return await generateUserStandup(u._id, dateKey);
      } catch (err) {
        return null;
      }
    })
  );

  return {
    hasTeam: true,
    team: {
      _id: team._id,
      name: team.name,
    },
    dateKey,
    standups: digests.filter(Boolean),
  };
};
