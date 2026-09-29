import crypto from 'crypto';
import { Meeting } from '../models/Meeting.js';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { getIO } from '../sockets/index.js';

/**
 * POST /api/meetings
 * Create a new WebRTC meeting
 */
export const createMeeting = async (req, res, next) => {
  try {
    const { title, teamId, participantIds } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Meeting title is required.',
      });
    }

    let assignedTeam = null;

    if (req.user.role === 'employee') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Employees cannot create new meetings.',
      });
    }

    if (req.user.role === 'manager') {
      const managedTeam = await Team.findOne({ manager: req.user._id });
      if (!managedTeam) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You do not manage any team.',
        });
      }

      if (teamId && teamId.toString() !== managedTeam._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. Managers can only create meetings for their own team.',
        });
      }
      assignedTeam = managedTeam._id;
    } else if (req.user.role === 'admin' && teamId) {
      const t = await Team.findById(teamId);
      if (t) assignedTeam = t._id;
    }

    // Default participants to creator + team members if team assigned
    const participantsSet = new Set();
    participantsSet.add(req.user._id.toString());

    if (Array.isArray(participantIds)) {
      participantIds.forEach((id) => participantsSet.add(id.toString()));
    }

    if (assignedTeam) {
      const tDoc = await Team.findById(assignedTeam);
      if (tDoc) {
        (tDoc.members || []).forEach((m) => participantsSet.add(m.toString()));
        if (tDoc.manager) participantsSet.add(tDoc.manager.toString());
      }
    }

    const meeting = await Meeting.create({
      title: title.trim(),
      meetingId: crypto.randomUUID(),
      createdBy: req.user._id,
      team: assignedTeam,
      participants: Array.from(participantsSet),
      status: 'active',
      startedAt: new Date(),
    });

    const populated = await Meeting.findById(meeting._id)
      .populate('createdBy', 'name email role')
      .populate('team', 'name')
      .populate('participants', 'name email role');

    res.status(201).json({
      success: true,
      message: 'Meeting created successfully.',
      data: { meeting: populated },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/meetings
 * List meetings authorized for authenticated user
 */
export const getMeetings = async (req, res, next) => {
  try {
    let filter = {};

    if (req.user.role === 'admin') {
      filter = {};
    } else if (req.user.role === 'manager') {
      const managedTeam = await Team.findOne({ manager: req.user._id });
      const teamId = managedTeam ? managedTeam._id : null;

      filter = {
        $or: [
          { createdBy: req.user._id },
          { participants: req.user._id },
          ...(teamId ? [{ team: teamId }] : []),
        ],
      };
    } else {
      // Employee
      const userTeam = req.user.team?._id || req.user.team;
      filter = {
        $or: [
          { participants: req.user._id },
          ...(userTeam ? [{ team: userTeam }] : []),
        ],
      };
    }

    const meetings = await Meeting.find(filter)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email role')
      .populate('team', 'name')
      .populate('participants', 'name email role');

    res.status(200).json({
      success: true,
      data: { meetings },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/meetings/:id
 * Retrieve single meeting details by _id or meetingId
 */
export const getMeetingById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    const meeting = await Meeting.findOne(
      isObjectId ? { $or: [{ _id: id }, { meetingId: id }] } : { meetingId: id }
    )
      .populate('createdBy', 'name email role')
      .populate('team', 'name')
      .populate('participants', 'name email role');

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    // Authorization check
    if (req.user.role !== 'admin') {
      const userIdStr = req.user._id.toString();
      const isParticipant = (meeting.participants || []).some(
        (p) => p._id.toString() === userIdStr
      );
      const isCreator = meeting.createdBy._id.toString() === userIdStr;

      let isTeamMember = false;
      if (meeting.team) {
        const teamDoc = await Team.findById(meeting.team._id || meeting.team);
        if (teamDoc) {
          isTeamMember =
            (teamDoc.members || []).some((m) => m.toString() === userIdStr) ||
            teamDoc.manager?.toString() === userIdStr;
        }
      }

      if (!isParticipant && !isCreator && !isTeamMember) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. You are not authorized to access this meeting.',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: { meeting },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/meetings/:id/end
 * End an active meeting
 */
export const endMeeting = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    const meeting = await Meeting.findOne(
      isObjectId ? { $or: [{ _id: id }, { meetingId: id }] } : { meetingId: id }
    );

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found.',
      });
    }

    // Authorization check
    const userIdStr = req.user._id.toString();
    const isCreator = meeting.createdBy.toString() === userIdStr;
    const isAdmin = req.user.role === 'admin';

    let isTeamManager = false;
    if (meeting.team) {
      const t = await Team.findById(meeting.team);
      if (t && t.manager?.toString() === userIdStr) isTeamManager = true;
    }

    if (!isCreator && !isTeamManager && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Only the meeting host, team manager, or admin can end this meeting.',
      });
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();
    await meeting.save();

    // Broadcast meeting:ended to the socket room
    const io = getIO();
    if (io) {
      io.to(`meeting:${meeting.meetingId}`).emit('meeting:ended', {
        meetingId: meeting.meetingId,
        endedAt: meeting.endedAt,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Meeting ended successfully.',
      data: { meeting },
    });
  } catch (error) {
    next(error);
  }
};
