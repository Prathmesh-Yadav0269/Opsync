import {
  generateUserStandup,
  updateUserContext,
  getTeamStandup as getManagerTeamStandup,
} from '../services/standupService.js';

/**
 * GET /api/standups/me/today
 * Generate or get today's personal standup
 */
export const getMyTodayStandup = async (req, res, next) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const standup = await generateUserStandup(req.user._id, todayStr);
    res.status(200).json({
      success: true,
      data: { standup },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/standups/me?date=YYYY-MM-DD
 * Get or generate personal standup for specific date
 */
export const getMyStandupByDate = async (req, res, next) => {
  try {
    const { date } = req.query;
    const standup = await generateUserStandup(req.user._id, date);
    res.status(200).json({
      success: true,
      data: { standup },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/standups/:id/context
 * Update optional user context on personal standup
 */
export const updateStandupContext = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userContext } = req.body;
    const standup = await updateUserContext(req.user._id, id, userContext);
    res.status(200).json({
      success: true,
      message: 'Standup context updated successfully.',
      data: { standup },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/standups/team?date=YYYY-MM-DD
 * Manager view of entire team's standup digests
 */
export const getTeamStandup = async (req, res, next) => {
  try {
    const { date } = req.query;
    const data = await getManagerTeamStandup(req.user._id, date);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
