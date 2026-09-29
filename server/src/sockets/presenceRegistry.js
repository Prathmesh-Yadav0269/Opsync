/**
 * In-memory connection registry for multi-tab safe presence.
 * Map<userId, Set<socketId>>
 */
class PresenceRegistry {
  constructor() {
    this.connections = new Map();
  }

  userConnected(userId, socketId) {
    const id = userId.toString();
    if (!this.connections.has(id)) {
      this.connections.set(id, new Set());
    }
    const userSockets = this.connections.get(id);
    const wasOffline = userSockets.size === 0;
    userSockets.add(socketId);
    return { wasOffline };
  }

  userDisconnected(userId, socketId) {
    const id = userId.toString();
    if (!this.connections.has(id)) {
      return { isOffline: true };
    }
    const userSockets = this.connections.get(id);
    userSockets.delete(socketId);

    if (userSockets.size === 0) {
      this.connections.delete(id);
      return { isOffline: true };
    }
    return { isOffline: false };
  }

  isUserOnline(userId) {
    if (!userId) return false;
    const id = userId.toString();
    return this.connections.has(id) && this.connections.get(id).size > 0;
  }

  getOnlineUserIds() {
    return Array.from(this.connections.keys());
  }

  getUserSockets(userId) {
    const id = userId.toString();
    return this.connections.get(id) || new Set();
  }
}

export const presenceRegistry = new PresenceRegistry();
