import mongoose from 'mongoose';
import { Task } from '../models/Task.js';
import { WorkSession } from '../models/WorkSession.js';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';

/**
 * Resolve start and end Date boundaries for analytics
 */
export const resolveDateRange = (period = 'weekly', dateInput = new Date()) => {
  const baseDate = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(baseDate.getTime())) {
    throw new Error('Invalid date input provided.');
  }

  let start = new Date(baseDate);
  let end = new Date(baseDate);

  if (period === 'daily') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'weekly') {
    // Monday to Sunday boundary
    const day = baseDate.getDay();
    const diffToMonday = (day + 6) % 7; // Monday = 0
    start.setDate(baseDate.getDate() - diffToMonday);
    start.setHours(0, 0, 0, 0);

    end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'monthly') {
    start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (period === 'yearly') {
    start = new Date(baseDate.getFullYear(), 0, 1, 0, 0, 0, 0);
    end = new Date(baseDate.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else {
    // Default 7 days
    start.setDate(baseDate.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
};

/**
 * Get Employee personal analytics
 */
export const getEmployeeAnalytics = async (userId, period = 'weekly', dateStr) => {
  const { start, end } = resolveDateRange(period, dateStr);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // 1. Task status metrics
  const taskStatusAgg = await Task.aggregate([
    { $match: { assignedTo: userObjectId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const statusMap = {
    'To Do': 0,
    'In Progress': 0,
    Review: 0,
    Done: 0,
    Blocked: 0,
  };
  let totalAssigned = 0;

  taskStatusAgg.forEach((item) => {
    if (statusMap[item._id] !== undefined) {
      statusMap[item._id] = item.count;
    }
    totalAssigned += item.count;
  });

  const statusDistribution = Object.keys(statusMap).map((status) => ({
    status,
    count: statusMap[status],
  }));

  // 2. Completed tasks within selected period (from Task audit history)
  const completedInPeriodAgg = await Task.aggregate([
    {
      $match: {
        assignedTo: userObjectId,
        history: {
          $elemMatch: {
            action: 'status_changed',
            newValue: 'Done',
            changedAt: { $gte: start, $lte: end },
          },
        },
      },
    },
    { $unwind: '$history' },
    {
      $match: {
        'history.action': 'status_changed',
        'history.newValue': 'Done',
        'history.changedAt': { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$history.changedAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const completionTrend = completedInPeriodAgg.map((item) => ({
    date: item._id,
    count: item.count,
  }));

  // 3. Work Sessions in period
  const sessionSummaryAgg = await WorkSession.aggregate([
    {
      $match: {
        user: userObjectId,
        start: { $gte: start, $lte: end },
        state: 'completed',
      },
    },
    {
      $group: {
        _id: null,
        totalDuration: { $sum: '$activeDuration' },
        totalInterruptions: { $sum: '$interruptions' },
        sessionCount: { $sum: 1 },
      },
    },
  ]);

  const totalDuration = sessionSummaryAgg[0]?.totalDuration || 0;
  const interruptions = sessionSummaryAgg[0]?.totalInterruptions || 0;
  const sessionCount = sessionSummaryAgg[0]?.sessionCount || 0;
  const averageDuration = sessionCount > 0 ? Math.round(totalDuration / sessionCount) : 0;

  // 4. Work duration trend over time
  const dateFormat = period === 'yearly' ? '%Y-%m' : '%Y-%m-%d';
  const durationTrendAgg = await WorkSession.aggregate([
    {
      $match: {
        user: userObjectId,
        start: { $gte: start, $lte: end },
        state: 'completed',
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$start' } },
        duration: { $sum: '$activeDuration' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const workDurationTrend = durationTrendAgg.map((item) => ({
    date: item._id,
    duration: item.duration,
    hours: parseFloat((item.duration / 3600).toFixed(2)),
  }));

  return {
    metrics: {
      tasksAssigned: totalAssigned,
      tasksCompleted: statusMap['Done'],
      tasksInProgress: statusMap['In Progress'],
      tasksBlocked: statusMap['Blocked'],
      tasksInReview: statusMap['Review'],
      totalActiveDuration: totalDuration,
      averageActiveDuration: averageDuration,
      interruptions,
    },
    statusDistribution,
    workDurationTrend,
    completionTrend,
    period,
    dateRange: { start, end },
  };
};

/**
 * Get Contribution Heatmap for calendar year
 */
export const getContributionHeatmap = async (userId, targetYear = new Date().getFullYear()) => {
  const year = parseInt(targetYear, 10) || new Date().getFullYear();
  const jan1 = new Date(year, 0, 1, 0, 0, 0, 0);
  const dec31 = new Date(year, 11, 31, 23, 59, 59, 999);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const dailyAgg = await WorkSession.aggregate([
    {
      $match: {
        user: userObjectId,
        start: { $gte: jan1, $lte: dec31 },
        state: 'completed',
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$start' } },
        totalDuration: { $sum: '$activeDuration' },
        sessionCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const dayMap = new Map();
  dailyAgg.forEach((item) => {
    dayMap.set(item._id, {
      duration: item.totalDuration,
      count: item.sessionCount,
    });
  });

  // Deterministic intensity calculation
  // 0: no activity, 1: <1h, 2: 1-3h, 3: 3-6h, 4: >6h
  const getIntensity = (duration) => {
    if (!duration || duration <= 0) return 0;
    if (duration <= 3600) return 1;
    if (duration <= 10800) return 2;
    if (duration <= 21600) return 3;
    return 4;
  };

  const days = [];
  let totalActiveDuration = 0;
  let activeDays = 0;

  const cur = new Date(jan1);
  while (cur <= dec31) {
    const dateKey = cur.toISOString().split('T')[0];
    const data = dayMap.get(dateKey) || { duration: 0, count: 0 };
    const intensity = getIntensity(data.duration);

    if (data.duration > 0) {
      totalActiveDuration += data.duration;
      activeDays++;
    }

    days.push({
      date: dateKey,
      duration: data.duration,
      count: data.count,
      intensity,
    });

    cur.setDate(cur.getDate() + 1);
  }

  return {
    year,
    totalActiveDuration,
    activeDays,
    days,
  };
};

/**
 * Get Manager own-team analytics
 */
export const getManagerTeamAnalytics = async (managerId, period = 'weekly', dateStr) => {
  const { start, end } = resolveDateRange(period, dateStr);

  const team = await Team.findOne({ manager: managerId }).populate(
    'members',
    'name email role department position'
  );

  if (!team) {
    return {
      hasTeam: false,
      message: 'No managed team assigned to current manager.',
      metrics: {
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        blockedTasks: 0,
        totalActiveDuration: 0,
      },
      memberComparison: [],
      workDurationTrend: [],
      statusDistribution: [],
    };
  }

  const teamObjectId = team._id;
  const allMemberIds = [team.manager, ...(team.members || []).map((m) => m._id)];

  // 1. Team Task status distribution
  const taskAgg = await Task.aggregate([
    { $match: { team: teamObjectId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const statusMap = {
    'To Do': 0,
    'In Progress': 0,
    Review: 0,
    Done: 0,
    Blocked: 0,
  };
  let totalTeamTasks = 0;

  taskAgg.forEach((item) => {
    if (statusMap[item._id] !== undefined) {
      statusMap[item._id] = item.count;
    }
    totalTeamTasks += item.count;
  });

  const statusDistribution = Object.keys(statusMap).map((status) => ({
    status,
    count: statusMap[status],
  }));

  // 2. Team Work Sessions
  const teamSessionsAgg = await WorkSession.aggregate([
    {
      $match: {
        user: { $in: allMemberIds },
        start: { $gte: start, $lte: end },
        state: 'completed',
      },
    },
    {
      $group: {
        _id: '$user',
        totalDuration: { $sum: '$activeDuration' },
        interruptions: { $sum: '$interruptions' },
        count: { $sum: 1 },
      },
    },
  ]);

  const memberDurationMap = new Map();
  let totalTeamDuration = 0;

  teamSessionsAgg.forEach((item) => {
    memberDurationMap.set(item._id.toString(), {
      duration: item.totalDuration,
      interruptions: item.interruptions,
      count: item.count,
    });
    totalTeamDuration += item.totalDuration;
  });

  // 3. Member comparison
  const memberComparison = (team.members || []).map((m) => {
    const sess = memberDurationMap.get(m._id.toString()) || {
      duration: 0,
      interruptions: 0,
      count: 0,
    };
    return {
      userId: m._id,
      name: m.name,
      email: m.email,
      role: m.role,
      department: m.department || 'General',
      duration: sess.duration,
      hours: parseFloat((sess.duration / 3600).toFixed(2)),
      interruptions: sess.interruptions,
      sessionsCompleted: sess.count,
    };
  });

  // 4. Team work duration trend
  const dateFormat = period === 'yearly' ? '%Y-%m' : '%Y-%m-%d';
  const durationTrendAgg = await WorkSession.aggregate([
    {
      $match: {
        user: { $in: allMemberIds },
        start: { $gte: start, $lte: end },
        state: 'completed',
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$start' } },
        duration: { $sum: '$activeDuration' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const workDurationTrend = durationTrendAgg.map((item) => ({
    date: item._id,
    duration: item.duration,
    hours: parseFloat((item.duration / 3600).toFixed(2)),
  }));

  return {
    hasTeam: true,
    team: {
      _id: team._id,
      name: team.name,
      memberCount: (team.members || []).length,
    },
    metrics: {
      totalTasks: totalTeamTasks,
      completedTasks: statusMap['Done'],
      inProgressTasks: statusMap['In Progress'],
      blockedTasks: statusMap['Blocked'],
      tasksInReview: statusMap['Review'],
      totalActiveDuration: totalTeamDuration,
    },
    memberComparison,
    workDurationTrend,
    statusDistribution,
    period,
    dateRange: { start, end },
  };
};

/**
 * Get Admin workspace organization analytics
 */
export const getAdminAnalytics = async (period = 'weekly', dateStr) => {
  const { start, end } = resolveDateRange(period, dateStr);

  const [totalUsers, activeUsers, totalTeams, totalTasks] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    Team.countDocuments(),
    Task.countDocuments(),
  ]);

  // Organization task status distribution
  const taskAgg = await Task.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const statusMap = {
    'To Do': 0,
    'In Progress': 0,
    Review: 0,
    Done: 0,
    Blocked: 0,
  };
  taskAgg.forEach((item) => {
    if (statusMap[item._id] !== undefined) {
      statusMap[item._id] = item.count;
    }
  });

  const statusDistribution = Object.keys(statusMap).map((status) => ({
    status,
    count: statusMap[status],
  }));

  // Organization total active duration in period
  const totalDurationAgg = await WorkSession.aggregate([
    {
      $match: {
        start: { $gte: start, $lte: end },
        state: 'completed',
      },
    },
    {
      $group: {
        _id: null,
        totalDuration: { $sum: '$activeDuration' },
      },
    },
  ]);
  const totalLoggedDuration = totalDurationAgg[0]?.totalDuration || 0;

  // Team comparison table
  const teams = await Team.find().populate('manager', 'name email').populate('members', '_id');
  const teamComparison = await Promise.all(
    teams.map(async (t) => {
      const taskCounts = await Task.aggregate([
        { $match: { team: t._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const tStatusMap = { 'To Do': 0, 'In Progress': 0, Review: 0, Done: 0, Blocked: 0 };
      let tTotal = 0;
      taskCounts.forEach((tc) => {
        if (tStatusMap[tc._id] !== undefined) tStatusMap[tc._id] = tc.count;
        tTotal += tc.count;
      });

      const memberIds = [t.manager?._id, ...(t.members || []).map((m) => m._id)].filter(Boolean);
      const teamDurAgg = await WorkSession.aggregate([
        {
          $match: {
            user: { $in: memberIds },
            start: { $gte: start, $lte: end },
            state: 'completed',
          },
        },
        { $group: { _id: null, total: { $sum: '$activeDuration' } } },
      ]);
      const teamDuration = teamDurAgg[0]?.total || 0;

      return {
        _id: t._id,
        name: t.name,
        managerName: t.manager?.name || 'Unassigned',
        memberCount: (t.members || []).length,
        totalTasks: tTotal,
        completedTasks: tStatusMap['Done'],
        inProgressTasks: tStatusMap['In Progress'],
        blockedTasks: tStatusMap['Blocked'],
        activeHours: parseFloat((teamDuration / 3600).toFixed(2)),
      };
    })
  );

  // Overall organization duration trend
  const dateFormat = period === 'yearly' ? '%Y-%m' : '%Y-%m-%d';
  const orgTrendAgg = await WorkSession.aggregate([
    {
      $match: {
        start: { $gte: start, $lte: end },
        state: 'completed',
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$start' } },
        duration: { $sum: '$activeDuration' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const workDurationTrend = orgTrendAgg.map((item) => ({
    date: item._id,
    duration: item.duration,
    hours: parseFloat((item.duration / 3600).toFixed(2)),
  }));

  return {
    organization: {
      totalUsers,
      activeUsers,
      totalTeams,
      totalTasks,
      completedTasks: statusMap['Done'],
      inProgressTasks: statusMap['In Progress'],
      blockedTasks: statusMap['Blocked'],
      totalLoggedDuration,
    },
    teamComparison,
    statusDistribution,
    workDurationTrend,
    period,
    dateRange: { start, end },
  };
};
