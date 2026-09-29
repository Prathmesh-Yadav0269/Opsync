import { verifyToken } from '../utils/jwt.js';
import { User } from '../models/User.js';

export const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, pair) => {
    const [key, value] = pair.trim().split('=');
    if (key && value) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
};

export const socketAuth = async (socket, next) => {
  try {
    let token = null;

    // 1. Try to extract token from handshake headers cookies
    if (socket.handshake.headers && socket.handshake.headers.cookie) {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      if (cookies.token) {
        token = cookies.token;
      }
    }

    // 2. Try Authorization header (Bearer token)
    if (!token && socket.handshake.headers && socket.handshake.headers.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    // 3. Fall back to handshake auth token
    if (!token && socket.handshake.auth && socket.handshake.auth.token) {
      token = socket.handshake.auth.token;
    }

    if (!token) {
      return next(new Error('Authentication error: No authentication token provided.'));
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return next(new Error('Authentication error: Invalid or expired token.'));
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new Error('Authentication error: User not found.'));
    }

    if (!user.isActive) {
      return next(new Error('Authentication error: User account is deactivated.'));
    }

    // Attach trusted user identity to socket
    socket.user = user;
    next();
  } catch (error) {
    return next(new Error(`Authentication error: ${error.message}`));
  }
};
