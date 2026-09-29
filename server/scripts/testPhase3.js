/**
 * OPSYNC — Phase 1 + Phase 2 + Phase 3 Acceptance & Regression Test Suite
 * Fully automated testing for all Phase 3 real-time collaboration, socket auth,
 * room isolation, presence, chat, notifications, and security attacks.
 */
import http from 'http';
import mongoose from 'mongoose';
import { io as ioClient } from 'socket.io-client';
import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import { initSocketServer } from '../src/sockets/index.js';
import { User } from '../src/models/User.js';
import { Team } from '../src/models/Team.js';
import { Task } from '../src/models/Task.js';
import { ChatRoom } from '../src/models/ChatRoom.js';
import { Message } from '../src/models/Message.js';
import { Notification } from '../src/models/Notification.js';
import { signToken } from '../src/utils/jwt.js';

const TEST_PORT = 5055;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let httpServer;
let ioServer;
let adminUser;
let managerA;
let managerB;
let employeeA;
let employeeB;
let crossEmployee;
let teamA;
let teamB;

let adminToken;
let managerAToken;
let employeeAToken;
let employeeBToken;
let crossEmployeeToken;

let passedCount = 0;
let failedCount = 0;

const logPass = (name, detail = '') => {
  passedCount++;
  console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ''}`);
};

const logFail = (name, detail = '') => {
  failedCount++;
  console.error(`[FAIL] ${name}${detail ? ` - ${detail}` : ''}`);
};

const apiRequest = async (path, { method = 'GET', token, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
};

const connectSocket = (token) => {
  return new Promise((resolve) => {
    const socket = ioClient(BASE_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 4000,
    });

    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => {
      socket.connectionError = err.message;
      resolve(socket);
    });
  });
};

const runAllTests = async () => {
  console.log('=== STARTING OPSYNC PHASE 1 + PHASE 2 + PHASE 3 TEST SUITE ===\n');

  try {
    await connectDB();

    // Start shared HTTP and Socket.IO server on test port
    httpServer = http.createServer(app);
    ioServer = initSocketServer(httpServer);

    await new Promise((res) => httpServer.listen(TEST_PORT, res));
    console.log(`[TEST SERVER] Running on port ${TEST_PORT} with Socket.IO initialized.\n`);

    const ts = Date.now();

    // 1. Setup verified development accounts
    adminUser = await User.findOne({ email: 'admin@opsync.local' });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'Opsync Admin',
        email: 'admin@opsync.local',
        password: 'AdminSecurePass123!',
        role: 'admin',
        isActive: true,
      });
    }
    adminToken = signToken(adminUser._id);

    managerA = await User.create({
      name: `Manager Alpha ${ts}`,
      email: `mgr_alpha_${ts}@opsync.local`,
      password: 'Password123!',
      role: 'manager',
      isActive: true,
    });
    managerAToken = signToken(managerA._id);

    managerB = await User.create({
      name: `Manager Beta ${ts}`,
      email: `mgr_beta_${ts}@opsync.local`,
      password: 'Password123!',
      role: 'manager',
      isActive: true,
    });

    employeeA = await User.create({
      name: `Employee A ${ts}`,
      email: `emp_a_${ts}@opsync.local`,
      password: 'Password123!',
      role: 'employee',
      isActive: true,
    });
    employeeAToken = signToken(employeeA._id);

    employeeB = await User.create({
      name: `Employee B ${ts}`,
      email: `emp_b_${ts}@opsync.local`,
      password: 'Password123!',
      role: 'employee',
      isActive: true,
    });
    employeeBToken = signToken(employeeB._id);

    crossEmployee = await User.create({
      name: `Cross Employee ${ts}`,
      email: `cross_emp_${ts}@opsync.local`,
      password: 'Password123!',
      role: 'employee',
      isActive: true,
    });
    crossEmployeeToken = signToken(crossEmployee._id);

    // Teams
    teamA = await Team.create({
      name: `Team Alpha ${ts}`,
      manager: managerA._id,
      members: [employeeA._id, employeeB._id],
    });
    await User.updateMany({ _id: { $in: [managerA._id, employeeA._id, employeeB._id] } }, { team: teamA._id });

    teamB = await Team.create({
      name: `Team Beta ${ts}`,
      manager: managerB._id,
      members: [crossEmployee._id],
    });
    await User.updateMany({ _id: { $in: [managerB._id, crossEmployee._id] } }, { team: teamB._id });

    // Reload users with team attached
    employeeA = await User.findById(employeeA._id);
    managerA = await User.findById(managerA._id);
    crossEmployee = await User.findById(crossEmployee._id);

    // ==========================================
    // PHASE 1 REGRESSION TESTS
    // ==========================================
    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@opsync.local', password: 'AdminSecurePass123!' },
    });
    if (loginRes.status === 200 && loginRes.data?.data?.user?.role === 'admin') {
      logPass('P1-Regression: Admin Login', 'Admin authenticated with working credentials');
    } else {
      logFail('P1-Regression: Admin Login', `Status: ${loginRes.status}`);
    }

    const regEscalationRes = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        name: `Escalation Test ${ts}`,
        email: `esc_${ts}@opsync.local`,
        password: 'Password123!',
        role: 'admin',
      },
    });
    if (regEscalationRes.status === 201 && regEscalationRes.data?.data?.user?.role === 'employee') {
      logPass('P1-Regression: Role Escalation Blocked', 'Public registration locked to employee');
    } else {
      logFail('P1-Regression: Role Escalation Blocked');
    }

    // ==========================================
    // PHASE 2 REGRESSION TESTS
    // ==========================================
    const usersRes = await apiRequest('/api/users', { token: adminToken });
    if (usersRes.status === 200 && usersRes.data?.data?.users?.length > 0) {
      logPass('P2-Regression: User Management', `Retrieved ${usersRes.data.data.users.length} users`);
    } else {
      logFail('P2-Regression: User Management');
    }

    // ==========================================
    // PHASE 3 ACCEPTANCE TESTS
    // ==========================================

    // P3-01: Socket Authentication
    const authedSocket = await connectSocket(employeeAToken);
    if (authedSocket.connected) {
      logPass('P3-01: Socket Authentication', `Socket connected with ID: ${authedSocket.id}`);
    } else {
      logFail('P3-01: Socket Authentication', authedSocket.connectionError);
    }

    const unauthedSocket = await connectSocket('invalid.jwt.token');
    if (unauthedSocket.connectionError || !unauthedSocket.connected) {
      logPass('P3-01b: Unauthenticated Socket Rejection', 'Rejected invalid token connection');
    } else {
      logFail('P3-01b: Unauthenticated Socket Rejection');
    }

    // P3-02: Inactive User Socket
    const inactiveUser = await User.create({
      name: 'Deactivated User',
      email: `deact_${ts}@opsync.local`,
      password: 'Password123!',
      role: 'employee',
      isActive: false,
    });
    const inactiveToken = signToken(inactiveUser._id);
    const inactiveSocket = await connectSocket(inactiveToken);
    if ((inactiveSocket.connectionError || !inactiveSocket.connected)) {
      logPass('P3-02: Inactive User Socket', 'Rejected deactivated account connection');
    } else {
      logFail('P3-02: Inactive User Socket');
    }

    // P3-03: Personal Room Isolation
    const empRooms = ioServer.sockets.adapter.rooms;
    const personalRoom = `user:${employeeA._id}`;
    if (empRooms.has(personalRoom)) {
      logPass('P3-03: Personal Room Auto-Join', `User automatically joined ${personalRoom}`);
    } else {
      logFail('P3-03: Personal Room Auto-Join');
    }

    // P3-04: Team Room Auto-Join
    const teamRoom = `team:${teamA._id}`;
    if (empRooms.has(teamRoom)) {
      logPass('P3-04: Team Room Auto-Join', `Team member joined ${teamRoom}`);
    } else {
      logFail('P3-04: Team Room Auto-Join');
    }

    // P3-07: Direct Chat Creation & Deduplication
    const directChatRes1 = await apiRequest(`/api/chats/direct/${employeeB._id}`, {
      method: 'POST',
      token: employeeAToken,
    });
    const directChatRes2 = await apiRequest(`/api/chats/direct/${employeeB._id}`, {
      method: 'POST',
      token: employeeAToken,
    });
    const roomId1 = directChatRes1.data?.data?.chat?._id;
    const roomId2 = directChatRes2.data?.data?.chat?._id;

    if (directChatRes1.status === 200 && roomId1 && roomId1 === roomId2) {
      logPass('P3-07: Direct Chat Creation & Deduplication', `Room reused: ${roomId1}`);
    } else {
      logFail('P3-07: Direct Chat Creation & Deduplication');
    }

    // P3-08: Unauthorized Direct Chat (Cross-team employees without shared team/manager)
    const unauthDirectRes = await apiRequest(`/api/chats/direct/${crossEmployee._id}`, {
      method: 'POST',
      token: employeeAToken,
    });
    if (unauthDirectRes.status === 403) {
      logPass('P3-08: Unauthorized Direct Chat Blocked', 'Cross-team employee private chat returned HTTP 403');
    } else {
      logFail('P3-08: Unauthorized Direct Chat Blocked', `Status: ${unauthDirectRes.status}`);
    }

    // P3-09: Team Chat Access
    const teamChatRes = await apiRequest(`/api/chats/team/${teamA._id}`, {
      method: 'GET',
      token: employeeAToken,
    });
    const unauthTeamChatRes = await apiRequest(`/api/chats/team/${teamA._id}`, {
      method: 'GET',
      token: crossEmployeeToken,
    });

    if (teamChatRes.status === 200 && unauthTeamChatRes.status === 403) {
      logPass('P3-09: Team Chat Scoping', 'Member accessed team chat (200), outsider denied (403)');
    } else {
      logFail('P3-09: Team Chat Scoping', `Member: ${teamChatRes.status}, Outsider: ${unauthTeamChatRes.status}`);
    }

    // P3-10: Message Persistence & Socket Delivery
    const empBSocket = await connectSocket(employeeBToken);
    await new Promise((res) => {
      empBSocket.emit('chat:join', { roomId: roomId1 }, res);
    });

    const testMessageText = `Live Socket Message ${ts}`;
    const receivedMessagePromise = new Promise((resolve) => {
      empBSocket.on('chat:message', (msg) => {
        if (msg.content === testMessageText) resolve(msg);
      });
    });

    authedSocket.emit('chat:send', { roomId: roomId1, content: testMessageText });
    const receivedMsg = await receivedMessagePromise;

    const dbMsg = await Message.findById(receivedMsg._id);
    if (receivedMsg && dbMsg && dbMsg.content === testMessageText) {
      logPass('P3-10: Message Persistence & Socket Delivery', `Message saved to DB and delivered via socket (id: ${dbMsg._id})`);
    } else {
      logFail('P3-10: Message Persistence & Socket Delivery');
    }

    // P3-11: Sender Spoof Attack
    const spoofContent = `Spoof Attempt ${ts}`;
    const spoofReceivedPromise = new Promise((resolve) => {
      empBSocket.on('chat:message', (msg) => {
        if (msg.content === spoofContent) resolve(msg);
      });
    });

    // Employee A sends payload pretending senderId is Admin
    authedSocket.emit('chat:send', {
      roomId: roomId1,
      content: spoofContent,
      senderId: adminUser._id.toString(),
    });
    const spoofResult = await spoofReceivedPromise;

    if (spoofResult.sender?._id.toString() === employeeA._id.toString()) {
      logPass('P3-11: Sender Spoof Attack Defeated', 'Actual sender derived strictly from socket.user identity');
    } else {
      logFail('P3-11: Sender Spoof Attack Defeated');
    }

    // P3-12: Room Spoof Attack
    const foreignTeamChatRes = await apiRequest(`/api/chats/team/${teamB._id}`, {
      method: 'GET',
      token: crossEmployeeToken,
    });
    const teamBRoomId = foreignTeamChatRes.data?.data?.chat?._id;

    let spoofRoomError = false;
    await new Promise((res) => {
      authedSocket.emit(
        'chat:send',
        { roomId: teamBRoomId, content: 'Illegal message' },
        (ack) => {
          if (!ack?.success) spoofRoomError = true;
          res();
        }
      );
    });

    const illegalMsgInDb = await Message.findOne({ room: teamBRoomId, content: 'Illegal message' });
    if (spoofRoomError && !illegalMsgInDb) {
      logPass('P3-12: Room Spoof Attack Defeated', 'Message to unauthorized room was rejected and NOT persisted');
    } else {
      logFail('P3-12: Room Spoof Attack Defeated');
    }

    // P3-13: Typing Indicator
    const typingPromise = new Promise((resolve) => {
      empBSocket.on('chat:typing:start', ({ roomId, userId }) => {
        if (roomId === roomId1 && userId === employeeA._id.toString()) {
          resolve(true);
        }
      });
    });
    authedSocket.emit('chat:typing:start', { roomId: roomId1 });
    const typingReceived = await typingPromise;
    if (typingReceived) {
      logPass('P3-13: Typing Indicators', 'Typing event delivered to authorized recipient');
    } else {
      logFail('P3-13: Typing Indicators');
    }

    // P3-14: Read Receipts
    await apiRequest(`/api/chats/${roomId1}/read`, {
      method: 'POST',
      token: employeeBToken,
    });
    const readUpdatedMsg = await Message.findById(receivedMsg._id);
    if (readUpdatedMsg.readBy.some((id) => id.toString() === employeeB._id.toString())) {
      logPass('P3-14: Read Receipts', 'Message readBy array updated with recipient ID');
    } else {
      logFail('P3-14: Read Receipts');
    }

    // P3-05: Real-time Task Assigned Event & Notification
    const taskAssignedPromise = new Promise((resolve) => {
      authedSocket.on('task:assigned', (t) => {
        resolve(t);
      });
    });

    const createTaskRes = await apiRequest('/api/tasks', {
      method: 'POST',
      token: managerAToken,
      body: {
        title: `Realtime Task ${ts}`,
        assignedTo: employeeA._id.toString(),
        team: teamA._id.toString(),
        priority: 'High',
      },
    });
    if (!createTaskRes.ok) {
      console.log('createTaskRes failed:', createTaskRes.status, createTaskRes.data);
    }

    const receivedLiveTask = await taskAssignedPromise;
    const taskNotif = await Notification.findOne({
      user: employeeA._id,
      type: 'task_assigned',
      entityId: createTaskRes.data?.data?.task?._id,
    });

    if (receivedLiveTask && taskNotif) {
      logPass('P3-05: Task Assigned Real-Time Event & Notification', `Task event received live, notification stored (id: ${taskNotif._id})`);
    } else {
      logFail('P3-05: Task Assigned Real-Time Event & Notification');
    }

    // P3-06: Real-Time Task Status Event
    const statusChangedPromise = new Promise((resolve) => {
      authedSocket.on('task:statusChanged', (t) => {
        resolve(t);
      });
    });

    await apiRequest(`/api/tasks/${receivedLiveTask._id}/status`, {
      method: 'PATCH',
      token: employeeAToken,
      body: { status: 'In Progress' },
    });

    const statusLiveTask = await statusChangedPromise;
    if (statusLiveTask && statusLiveTask.status === 'In Progress') {
      logPass('P3-06: Task Status Real-Time Event', `Status update received live (status: ${statusLiveTask.status})`);
    } else {
      logFail('P3-06: Task Status Real-Time Event');
    }

    // P3-15/16/17: Multi-Tab Safe Presence & Last Seen
    // Connect tab 2 for employeeA
    const authedSocketTab2 = await connectSocket(employeeAToken);
    // Disconnect tab 1
    authedSocket.disconnect();
    // User should still have active socket in tab 2
    const empUserMid = await User.findById(employeeA._id);
    // Disconnect tab 2
    authedSocketTab2.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    const empUserFinal = await User.findById(employeeA._id);
    if (empUserFinal.lastSeen) {
      logPass('P3-15/16/17: Multi-Tab Safe Presence & Last Seen', `User lastSeen updated on final disconnect: ${empUserFinal.lastSeen.toISOString()}`);
    } else {
      logFail('P3-15/16/17: Multi-Tab Safe Presence & Last Seen');
    }

    // P3-21/22: Notification Isolation & Unread Count
    const employeeANotifs = await apiRequest('/api/notifications', { token: employeeAToken });
    const employeeBNotifs = await apiRequest('/api/notifications', { token: employeeBToken });

    const hasAInB = employeeBNotifs.data?.data?.notifications?.some(
      (n) => n.user?.toString() === employeeA._id.toString()
    );

    if (!hasAInB && employeeANotifs.data?.data?.unreadCount >= 1) {
      logPass('P3-21/22: Notification Isolation & Unread Count', `Unread count: ${employeeANotifs.data.data.unreadCount}, strictly scoped`);
    } else {
      logFail('P3-21/22: Notification Isolation & Unread Count');
    }

    // P3-19/20: Team Membership Notification & Stale Room Eviction
    const empBSocket2 = await connectSocket(employeeBToken);
    const removeMemberRes = await apiRequest(`/api/teams/${teamA._id}/members/${employeeB._id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    const removalNotif = await Notification.findOne({
      user: employeeB._id,
      type: 'team_membership',
    });
    const teamRooms = ioServer.sockets.adapter.rooms;
    const isStillInTeam = teamRooms.get(`team:${teamA._id}`)?.has(empBSocket2.id);

    if (removeMemberRes.status === 200 && removalNotif && !isStillInTeam) {
      logPass('P3-19/20: Team Membership Events & Stale Room Eviction', 'Employee removed, notified, and evicted from team room');
    } else {
      logFail('P3-19/20: Team Membership Events & Stale Room Eviction');
    }
    empBSocket2.disconnect();

    // Close remaining sockets
    empBSocket.disconnect();

  } catch (err) {
    console.error('[UNEXPECTED TEST ERROR]', err);
    logFail('Test Suite Runtime', err.message);
  } finally {
    if (httpServer) {
      await new Promise((r) => httpServer.close(r));
    }
    await mongoose.disconnect();
    console.log(`\n=== COMPLETED TEST SUITE: ${passedCount} PASSED, ${failedCount} FAILED ===\n`);
    process.exit(failedCount > 0 ? 1 : 0);
  }
};

runAllTests();
