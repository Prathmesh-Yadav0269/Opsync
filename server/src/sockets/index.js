import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { socketAuth } from './socketAuth.js';
import { presenceRegistry } from './presenceRegistry.js';
import { User } from '../models/User.js';
import { ChatRoom } from '../models/ChatRoom.js';
import { Message } from '../models/Message.js';
import { Notification } from '../models/Notification.js';
import { Meeting } from '../models/Meeting.js';
import { canAccessChatRoom } from '../services/teamChatService.js';

let ioInstance = null;

export const setIO = (io) => {
  ioInstance = io;
};

export const getIO = () => ioInstance;

export const initSocketServer = (httpServer) => {
  const rawOrigins = env.CLIENT_URL
    ? env.CLIENT_URL.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:5173'];

  const allowedOrigins = rawOrigins.map((o) => o.replace(/\/$/, ''));

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }
        const normalizedOrigin = origin.replace(/\/$/, '');
        if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by Socket.IO CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
  });

  // Authenticate socket connections
  io.use(socketAuth);

  io.on('connection', async (socket) => {
    const user = socket.user;
    const userId = user._id.toString();

    // 1. Join personal room: user:<userId>
    socket.join(`user:${userId}`);

    // 2. Join team room if user has a verified team: team:<teamId>
    let teamIdStr = null;
    if (user.team) {
      teamIdStr = user.team._id ? user.team._id.toString() : user.team.toString();
      socket.join(`team:${teamIdStr}`);
    }

    // 3. Multi-tab presence registry
    const { wasOffline } = presenceRegistry.userConnected(userId, socket.id);
    if (wasOffline && teamIdStr) {
      // Scoped broadcast to own team only
      io.to(`team:${teamIdStr}`).emit('presence:update', {
        userId,
        status: 'online',
      });
    }

    // Room join listener with strict database authorization check
    socket.on('chat:join', async ({ roomId }, callback) => {
      try {
        if (!roomId) {
          if (callback) callback({ success: false, error: 'Invalid room ID' });
          return;
        }

        const room = await ChatRoom.findById(roomId);
        if (!room) {
          if (callback) callback({ success: false, error: 'Room not found' });
          return;
        }

        const hasAccess = await canAccessChatRoom(user, room);
        if (!hasAccess) {
          if (callback) callback({ success: false, error: 'Forbidden. Unauthorized to join chat room.' });
          return;
        }

        socket.join(`chat:${roomId}`);
        if (callback) callback({ success: true });
      } catch (err) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    socket.on('chat:leave', ({ roomId }) => {
      if (roomId) {
        socket.leave(`chat:${roomId}`);
      }
    });

    // Chat Message listener
    socket.on('chat:send', async ({ roomId, content, attachment }, callback) => {
      try {
        if (!roomId || (!content?.trim() && !attachment)) {
          if (callback) callback({ success: false, error: 'Content or attachment is required.' });
          return;
        }

        const room = await ChatRoom.findById(roomId);
        if (!room) {
          if (callback) callback({ success: false, error: 'Room not found.' });
          return;
        }

        const hasAccess = await canAccessChatRoom(user, room);
        if (!hasAccess) {
          if (callback) callback({ success: false, error: 'Forbidden. Unauthorized to send messages to this room.' });
          return;
        }

        const message = await Message.create({
          room: roomId,
          sender: user._id,
          content: content?.trim() || '',
          attachment: attachment || null,
          readBy: [user._id],
        });

        await ChatRoom.findByIdAndUpdate(roomId, {
          lastMessage: message._id,
          lastMessageAt: message.createdAt,
        });

        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'name email role department position')
          .populate('readBy', 'name email');

        io.to(`chat:${roomId}`).emit('chat:message', populatedMessage);

        const otherMembers = room.members.filter((m) => m.toString() !== userId);
        for (const recipientId of otherMembers) {
          const notif = await Notification.create({
            user: recipientId,
            type: 'chat_message',
            title: `New message from ${user.name}`,
            message: content ? (content.length > 60 ? `${content.substring(0, 60)}...` : content) : 'Sent an attachment',
            data: { roomId, messageId: message._id },
          });
          io.to(`user:${recipientId.toString()}`).emit('notification:new', notif);
        }

        if (callback) callback({ success: true, data: populatedMessage });
      } catch (err) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // Typing indicators
    socket.on('chat:typing:start', ({ roomId }) => {
      if (roomId) {
        socket.to(`chat:${roomId}`).emit('chat:typing:start', {
          roomId,
          userId,
          name: user.name,
        });
      }
    });

    socket.on('chat:typing:stop', ({ roomId }) => {
      if (roomId) {
        socket.to(`chat:${roomId}`).emit('chat:typing:stop', {
          roomId,
          userId,
        });
      }
    });

    // Read receipts
    socket.on('chat:read', async ({ roomId }) => {
      try {
        if (!roomId) return;
        await Message.updateMany(
          { room: roomId, readBy: { $ne: user._id } },
          { $addToSet: { readBy: user._id } }
        );

        io.to(`chat:${roomId}`).emit('chat:read', {
          roomId,
          userId,
          readAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[SOCKET CHAT:READ ERROR]', err.message);
      }
    });

    // ==========================================
    // Phase 6: WebRTC Video Meetings Signaling
    // ==========================================
    socket.on('meeting:join', async ({ meetingId }, callback) => {
      try {
        if (!meetingId) {
          if (callback) callback({ success: false, error: 'Invalid meeting ID' });
          return;
        }

        const isObjectId = /^[0-9a-fA-F]{24}$/.test(meetingId);
        const meeting = await Meeting.findOne(
          isObjectId ? { $or: [{ _id: meetingId }, { meetingId }] } : { meetingId }
        );

        if (!meeting) {
          if (callback) callback({ success: false, error: 'Meeting not found' });
          return;
        }

        if (meeting.status === 'ended') {
          if (callback) callback({ success: false, error: 'Meeting has ended' });
          return;
        }

        let isAuthorized = user.role === 'admin' || meeting.createdBy.toString() === userId;
        if (!isAuthorized) {
          isAuthorized = (meeting.participants || []).some((p) => p.toString() === userId);
        }
        if (!isAuthorized && meeting.team) {
          isAuthorized = meeting.team.toString() === teamIdStr;
        }

        if (!isAuthorized) {
          if (callback) callback({ success: false, error: 'Forbidden. Unauthorized to join meeting.' });
          return;
        }

        const roomName = `meeting:${meeting.meetingId}`;
        socket.join(roomName);
        socket.currentMeetingId = meeting.meetingId;

        // Broadcast to other peers in room
        socket.to(roomName).emit('meeting:participantJoined', {
          socketId: socket.id,
          userId,
          name: user.name,
          role: user.role,
        });

        // Collect existing connected socket IDs in this meeting room
        const roomSockets = io.sockets.adapter.rooms.get(roomName);
        const existingParticipants = roomSockets
          ? Array.from(roomSockets).filter((sid) => sid !== socket.id)
          : [];

        if (callback) {
          callback({
            success: true,
            meetingId: meeting.meetingId,
            existingParticipants,
          });
        }
      } catch (err) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // WebRTC Offer relay
    socket.on('meeting:offer', ({ targetSocketId, offer, meetingId }) => {
      if (!targetSocketId || !offer || !meetingId) return;
      const roomName = `meeting:${meetingId}`;
      const roomSockets = io.sockets.adapter.rooms.get(roomName);
      if (!roomSockets || !roomSockets.has(socket.id) || !roomSockets.has(targetSocketId)) {
        return; // Reject: sender or target is not in this meeting room
      }

      io.to(targetSocketId).emit('meeting:offer', {
        senderSocketId: socket.id,
        senderUserId: userId,
        senderName: user.name,
        senderRole: user.role,
        offer,
        meetingId,
      });
    });

    // WebRTC Answer relay
    socket.on('meeting:answer', ({ targetSocketId, answer, meetingId }) => {
      if (!targetSocketId || !answer || !meetingId) return;
      const roomName = `meeting:${meetingId}`;
      const roomSockets = io.sockets.adapter.rooms.get(roomName);
      if (!roomSockets || !roomSockets.has(socket.id) || !roomSockets.has(targetSocketId)) {
        return; // Reject: sender or target is not in this meeting room
      }

      io.to(targetSocketId).emit('meeting:answer', {
        senderSocketId: socket.id,
        senderUserId: userId,
        answer,
        meetingId,
      });
    });

    // WebRTC ICE Candidate relay
    socket.on('meeting:iceCandidate', ({ targetSocketId, candidate, meetingId }) => {
      if (!targetSocketId || !candidate || !meetingId) return;
      const roomName = `meeting:${meetingId}`;
      const roomSockets = io.sockets.adapter.rooms.get(roomName);
      if (!roomSockets || !roomSockets.has(socket.id) || !roomSockets.has(targetSocketId)) {
        return; // Reject: sender or target is not in this meeting room
      }

      io.to(targetSocketId).emit('meeting:iceCandidate', {
        senderSocketId: socket.id,
        candidate,
        meetingId,
      });
    });

    // Leave meeting
    socket.on('meeting:leave', ({ meetingId }) => {
      const mId = meetingId || socket.currentMeetingId;
      if (mId) {
        socket.leave(`meeting:${mId}`);
        socket.to(`meeting:${mId}`).emit('meeting:participantLeft', {
          socketId: socket.id,
          userId,
        });
        socket.currentMeetingId = null;
      }
    });

    // Disconnect handling
    socket.on('disconnect', async () => {
      if (socket.currentMeetingId) {
        socket.to(`meeting:${socket.currentMeetingId}`).emit('meeting:participantLeft', {
          socketId: socket.id,
          userId,
        });
      }

      const { isOffline } = presenceRegistry.userDisconnected(userId, socket.id);

      if (isOffline) {
        const lastSeen = new Date();
        await User.findByIdAndUpdate(userId, { lastSeen });

        if (teamIdStr) {
          io.to(`team:${teamIdStr}`).emit('presence:update', {
            userId,
            status: 'offline',
            lastSeen: lastSeen.toISOString(),
          });
        }
      }
    });
  });

  setIO(io);
  return io;
};
