import { User } from '../models/User.js';
import { signToken, sendTokenCookie, clearTokenCookie } from '../utils/jwt.js';
import { createResetToken, hashToken } from '../utils/crypto.js';
import { env } from '../config/env.js';

/**
 * Public registration - strictly creates 'employee' accounts.
 * Role escalation to 'admin' or 'manager' is prohibited.
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    // Force role to employee regardless of what payload contained
    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password,
      role: 'employee',
    });

    const token = signToken(user._id);
    sendTokenCookie(res, token);

    res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Authenticate user with email and password
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account is deactivated. Please contact an administrator.',
      });
    }

    // Update audit fields
    user.lastLogin = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    const token = signToken(user._id);
    sendTokenCookie(res, token);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear authentication session
 */
export const logout = async (req, res, next) => {
  try {
    clearTokenCookie(res);
    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Return authenticated user profile
 */
export const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Isolated password reset email dispatcher (stub for future provider integration)
 */
const dispatchResetNotification = async ({ email, resetToken }) => {
  // In Phase 1 without third-party mailer, log in development for local verification
  if (env.NODE_ENV === 'development') {
    console.log(`[AUTH-DEV] Password reset requested for ${email}. Token: ${resetToken}`);
  }
};

/**
 * Request password reset token
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      // Safe enumeration protection message
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, password reset instructions have been generated.',
      });
    }

    const { resetToken, hashedToken } = createResetToken();

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    await dispatchResetNotification({ email: user.email, resetToken });

    const responsePayload = {
      success: true,
      message: 'If an account with that email exists, password reset instructions have been generated.',
    };

    // In local development, expose reset token safely to allow UI testing without mail service
    if (env.NODE_ENV === 'development') {
      responsePayload.dev = {
        resetToken,
        note: 'Development mode only: token provided for testing without email server.',
      };
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password using cryptographically hashed token
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired.',
      });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    const authToken = signToken(user._id);
    sendTokenCookie(res, authToken);

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You are now logged in.',
      data: {
        user,
        token: authToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change password for authenticated user
 */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.',
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
