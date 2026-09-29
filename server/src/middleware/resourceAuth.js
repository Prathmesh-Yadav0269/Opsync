/**
 * Resource-level authorization helper architecture for OPSYNC.
 * Prepared for Phase 2+ modules (tasks, projects, teams) to enforce
 * fine-grained ownership and permission checks beyond role checking.
 */

export const authorizeResource = (resolver) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
        });
      }

      const isAuthorized = await resolver(req, req.user);
      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You do not have permission to access or modify this resource.',
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Self-or-Admin helper (used for user self-management)
 */
export const authorizeSelfOrRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const targetUserId = req.params.id || req.params.userId;
    const isSelf = targetUserId && req.user._id.toString() === targetUserId.toString();
    const hasRole = allowedRoles.includes(req.user.role);

    if (!isSelf && !hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You can only access your own resource or require higher privileges.',
      });
    }

    next();
  };
};
