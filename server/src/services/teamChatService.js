import { ChatRoom } from '../models/ChatRoom.js';
import { Team } from '../models/Team.js';
import { Message } from '../models/Message.js';

/**
 * Ensures exactly one synchronized Team ChatRoom exists for a given Team.
 * Idempotent, deduplicated, and synchronized with current Team.manager and Team.members.
 *
 * @param {Object|string} teamOrId - Team document or team ObjectId
 * @returns {Promise<ChatRoom>} - The primary Team ChatRoom document
 */
export const ensureTeamChatRoom = async (teamOrId) => {
  if (!teamOrId) return null;

  let team = teamOrId;
  if (!team.members || !team.name) {
    team = await Team.findById(teamOrId);
  }
  if (!team) return null;

  const extractIdStr = (val) => {
    if (!val) return null;
    if (val._id) return val._id.toString();
    return String(val);
  };

  // Compile authoritative member IDs: manager + members
  const memberSet = new Set();
  const mgrId = extractIdStr(team.manager);
  if (mgrId) {
    memberSet.add(mgrId);
  }
  if (Array.isArray(team.members)) {
    team.members.forEach((m) => {
      const mId = extractIdStr(m);
      if (mId) memberSet.add(mId);
    });
  }

  const memberIds = Array.from(memberSet);

  // Check for existing team room
  let room = await ChatRoom.findOne({ type: 'team', team: team._id });

  if (!room) {
    try {
      room = await ChatRoom.create({
        type: 'team',
        team: team._id,
        members: memberIds,
      });
    } catch (err) {
      // In case of race condition with unique compound index
      room = await ChatRoom.findOne({ type: 'team', team: team._id });
      if (!room) throw err;
    }
  } else {
    // Synchronize members array
    room.members = memberIds;
    await room.save();
  }

  return room;
};

/**
 * Clean up associated Team ChatRoom when a Team is safely removed.
 *
 * @param {string|ObjectId} teamId - The team ID being deleted
 */
export const cleanupTeamChatRoom = async (teamId) => {
  if (!teamId) return;
  const room = await ChatRoom.findOne({ type: 'team', team: teamId });
  if (room) {
    await Message.deleteMany({ room: room._id });
    await ChatRoom.findByIdAndDelete(room._id);
  }
};

/**
 * Authoritative chat room authorization check.
 * Strictly verifies current Team membership dynamically for team chats,
 * and direct 1:1 participant isolation for direct chats.
 *
 * @param {Object} user - Authenticated user document or session object
 * @param {Object} room - ChatRoom document
 * @returns {Promise<boolean>} - True if authorized
 */
export const canAccessChatRoom = async (user, room) => {
  if (!user || !room) return false;
  const userIdStr = (user._id || user).toString();

  const extractIdStr = (val) => {
    if (!val) return '';
    if (val._id) return val._id.toString();
    return String(val);
  };

  // One-to-one direct chat: strictly limited to the two participants
  if (room.type === 'one-to-one') {
    return Array.isArray(room.members) && room.members.some((m) => extractIdStr(m) === userIdStr);
  }

  // Team chat: strictly verifies current Team state in database
  if (room.type === 'team') {
    if (!room.team) return false;

    const team = await Team.findById(room.team);
    if (!team) return false;

    // Current manager
    if (team.manager && extractIdStr(team.manager) === userIdStr) {
      return true;
    }

    // Current active team member
    if (Array.isArray(team.members) && team.members.some((m) => extractIdStr(m) === userIdStr)) {
      return true;
    }

    // System administrator
    if (user.role === 'admin') {
      return true;
    }

    return false;
  }

  return false;
};
