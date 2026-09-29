import {
  getEmployeeAnalytics,
  getContributionHeatmap,
  getManagerTeamAnalytics,
  getAdminAnalytics as getAdminAggregatedAnalytics,
} from '../services/analyticsService.js';
import { Team } from '../models/Team.js';

/**
 * GET /api/analytics/me
 * Personal analytics for authenticated user
 */
export const getMyAnalytics = async (req, res, next) => {
  try {
    const { period, date } = req.query;
    const data = await getEmployeeAnalytics(req.user._id, period, date);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/me/heatmap
 * Contribution Heatmap for authenticated user
 */
export const getMyHeatmap = async (req, res, next) => {
  try {
    const { year } = req.query;
    const data = await getContributionHeatmap(req.user._id, year);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/team
 * Manager's own team analytics (Admin may oversee)
 */
export const getTeamAnalytics = async (req, res, next) => {
  try {
    const { period, date } = req.query;

    let targetManagerId = req.user._id;
    if (req.user.role === 'admin' && req.query.managerId) {
      targetManagerId = req.query.managerId;
    }

    const data = await getManagerTeamAnalytics(targetManagerId, period, date);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/team/members/:userId
 * Inspect analytics for a specific member of manager's team
 */
export const getTeamMemberAnalytics = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { period, date } = req.query;

    if (req.user.role === 'manager') {
      const managedTeam = await Team.findOne({ manager: req.user._id });
      if (!managedTeam) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You do not manage any team.',
        });
      }

      const isMember = managedTeam.members.some((m) => m.toString() === userId);
      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. This user is not a member of your team.',
        });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to view coworker analytics.',
      });
    }

    const data = await getEmployeeAnalytics(userId, period, date);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/admin
 * Organization-wide analytics for workspace administrators
 */
export const getAdminAnalytics = async (req, res, next) => {
  try {
    const { period, date } = req.query;
    const data = await getAdminAggregatedAnalytics(period, date);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
