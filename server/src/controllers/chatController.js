import { ChatRoom } from '../models/ChatRoom.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { Team } from '../models/Team.js';
import { getIO } from '../sockets/index.js';
import { canAccessChatRoom, ensureTeamChatRoom } from '../services/teamChatService.js';

/**
 * Check if two users are organizationally permitted to have direct one-to-one chat
 */
const canCommunicateDirectly = async (userA, userB) => {
  if (userA._id.toString() === userB._id.toString()) return false;
  if (!userB.isActive) return false;

  // Admin can communicate with any active user
  if (userA.role === 'admin' || userB.role === 'admin') return true;

  // Same team check
  const teamAId = userA.team?._id ? userA.team._id.toString() : userA.team?.toString();
  const teamBId = userB.team?._id ? userB.team._id.toString() : userB.team?.toString();

  if (teamAId && teamBId && teamAId === teamBId) {
    return true;
  }

  // Manager of user's team
  if (userA.role === 'manager') {
    const managedTeam = await Team.findOne({ manager: userA._id });
    if (managedTeam && managedTeam.members.some((m) => m.toString() === userB._id.toString())) {
      return true;
    }
  }

  if (userB.role === 'manager') {
    const managedTeam = await Team.findOne({ manager: userB._id });
    if (managedTeam && managedTeam.members.some((m) => m.toString() === userA._id.toString())) {
      return true;
    }
  }

  return false;
};

/**
 * GET /api/chats
 * List active direct and team chats for current user
 */
export const getChats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Find rooms where user is member or matches team
    const rooms = await ChatRoom.find({
      $or: [
        { members: userId },
        ...(req.user.team ? [{ type: 'team', team: req.user.team }] : []),
      ],
    })
      .populate('members', 'name email role department position lastSeen')
      .populate('team', 'name description')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'name email role' },
      })
      .sort({ updatedAt: -1 });

    // Filter rooms by dynamic authorization (strictly verifies current Team membership)
    const authorizedRooms = [];
    for (const room of rooms) {
      if (await canAccessChatRoom(req.user, room)) {
        authorizedRooms.push(room);
      }
    }

    // Calculate unread count for each authorized room
    const roomsWithUnread = await Promise.all(
      authorizedRooms.map(async (room) => {
        const unreadCount = await Message.countDocuments({
          room: room._id,
          sender: { $ne: userId },
          readBy: { $ne: userId },
        });

        const roomObj = room.toJSON();
        roomObj.unreadCount = unreadCount;
        return roomObj;
      })
    );

    res.status(200).json({
      success: true,
      data: { chats: roomsWithUnread },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chats/direct/:userId
 * Get or create unique one-to-one direct chat room
 */
export const getOrCreateDirectChat = async (req, res, next) => {
  try {
    const { userId: targetUserId } = req.params;

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Target user not found.',
      });
    }

    const isPermitted = await canCommunicateDirectly(req.user, targetUser);
    if (!isPermitted) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to start a direct chat with this user.',
      });
    }

    // Check for existing direct chat room between the two users
    let room = await ChatRoom.findOne({
      type: 'one-to-one',
      members: { $all: [req.user._id, targetUser._id], $size: 2 },
    })
      .populate('members', 'name email role department position lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'name email role' },
      });

    if (!room) {
      room = await ChatRoom.create({
        type: 'one-to-one',
        members: [req.user._id, targetUser._id],
      });

      room = await ChatRoom.findById(room._id).populate(
        'members',
        'name email role department position lastSeen'
      );
    }

    res.status(200).json({
      success: true,
      data: { chat: room },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chats/team/:teamId
 * Get or initialize team chat room
 */
export const getTeamChat = async (req, res, next) => {
  try {
    const { teamId } = req.params;

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found.',
      });
    }

    const isManager = team.manager?.toString() === req.user._id.toString();
    const isMember = team.members.some((m) => m.toString() === req.user._id.toString());
    const isAdmin = req.user.role === 'admin';

    if (!isManager && !isMember && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You are not a member of this team.',
      });
    }

    let room = await ensureTeamChatRoom(team);

    const populatedRoom = await ChatRoom.findById(room._id)
      .populate('members', 'name email role department position lastSeen')
      .populate('team', 'name description')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'name email role' },
      });

    res.status(200).json({
      success: true,
      data: { chat: populatedRoom },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chats/:roomId/messages
 * Retrieve paginated message history for authorized room
 */
export const getMessages = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found.',
      });
    }

    const hasAccess = await canAccessChatRoom(req.user, room);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have access to this chat room.',
      });
    }

    const totalMessages = await Message.countDocuments({ room: room._id });
    const messagesDesc = await Message.find({ room: room._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('sender', 'name email role department');

    const messages = messagesDesc.reverse();

    res.status(200).json({
      success: true,
      data: {
        messages,
        pagination: {
          page,
          limit,
          totalMessages,
          totalPages: Math.ceil(totalMessages / limit),
          hasMore: page * limit < totalMessages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chats/:roomId/read
 * Mark messages in room as read by current user
 */
export const markMessagesRead = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found.',
      });
    }

    const hasAccess = await canAccessChatRoom(req.user, room);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have access to this room.',
      });
    }

    await Message.updateMany(
      { room: room._id, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );

    const io = getIO();
    if (io) {
      io.to(`chat:${roomId}`).emit('chat:read', {
        roomId,
        userId: req.user._id,
        readAt: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      message: 'Messages marked as read.',
    });
  } catch (error) {
    next(error);
  }
};
