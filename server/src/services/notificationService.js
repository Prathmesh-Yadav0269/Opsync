import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { getIO } from '../sockets/index.js';

const TYPE_PREFERENCE_MAP = {
  task_assigned: 'taskAssignments',
  task_deadline: 'taskDeadlines',
  chat_message: 'messages',
  message: 'messages',
  file_uploaded: 'fileUploads',
  team_membership: 'teamMembership',
};

export const createNotification = async ({
  userId,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
}) => {
  try {
    // Check recipient's notification preference
    const recipient = await User.findById(userId).select('settings');
    if (recipient && recipient.settings?.notifications) {
      const prefKey = TYPE_PREFERENCE_MAP[type];
      if (prefKey && recipient.settings.notifications[prefKey] === false) {
        // Notification suppressed by recipient preference
        return null;
      }
    }

    const notification = await Notification.create({
      user: userId,
      type,
      title,
      message,
      entityType,
      entityId: entityId ? entityId.toString() : null,
      isRead: false,
    });

    const io = getIO();
    if (io) {
      io.to(`user:${userId.toString()}`).emit('notification:new', notification);
    }

    return notification;
  } catch (error) {
    console.error(`[NOTIFICATION SERVICE ERROR] ${error.message}`);
    return null;
  }
};
