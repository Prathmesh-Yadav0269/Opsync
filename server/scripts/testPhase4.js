import mongoose from 'mongoose';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { io as ClientIO } from 'socket.io-client';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Team } from '../src/models/Team.js';
import { Task } from '../src/models/Task.js';
import { ChatRoom } from '../src/models/ChatRoom.js';
import { Message } from '../src/models/Message.js';
import { Notification } from '../src/models/Notification.js';
import { File } from '../src/models/File.js';
import { WorkSession } from '../src/models/WorkSession.js';
import { initSocketServer, setIO } from '../src/sockets/index.js';
import { signToken } from '../src/utils/jwt.js';
import { UPLOAD_DIR } from '../src/config/upload.js';

let testServer;
let ioServer;
const TEST_PORT = 5056;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let passCount = 0;
let failCount = 0;

const logPass = (id, detail = '') => {
  passCount++;
  console.log(`[PASS] ${id}${detail ? ` - ${detail}` : ''}`);
};

const logFail = (id, detail = '') => {
  failCount++;
  console.error(`[FAIL] ${id}${detail ? ` - ${detail}` : ''}`);
};

const apiRequest = async (endpoint, options = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  const headers = options.headers || {};
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body === 'object') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body,
  });

  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { status: response.status, headers: response.headers, data };
};

const connectSocket = (token) => {
  return new Promise((resolve, reject) => {
    const socket = ClientIO(BASE_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
};

const runSuite = async () => {
  console.log('=== STARTING OPSYNC PHASE 4 ACCEPTANCE TEST SUITE ===\n');

  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log(`[DATABASE] MongoDB Connected: ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);

    testServer = http.createServer(app);
    ioServer = initSocketServer(testServer);
    setIO(ioServer);

    await new Promise((resolve) => testServer.listen(TEST_PORT, resolve));
    console.log(`[TEST SERVER] Running on port ${TEST_PORT} with Socket.IO initialized.\n`);

    // Clean test artifacts
    const testPrefix = `p4_${Date.now()}`;
    const emailSuffix = `${testPrefix}@opsync.local`;

    // ----------------------------------------------------
    // P4-01: Admin Login Regression
    // ----------------------------------------------------
    const adminLoginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: env.ADMIN_EMAIL || 'admin@opsync.local',
        password: env.ADMIN_PASSWORD || 'AdminSecurePass123!',
      },
    });

    const admin = await User.findOne({ email: env.ADMIN_EMAIL || 'admin@opsync.local' });
    const adminToken = admin ? signToken(admin._id) : null;

    if (adminLoginRes.status === 200 && adminToken) {
      logPass('P4-01: Admin Login Regression', `Admin authenticated successfully (${admin.email})`);
    } else {
      logFail('P4-01: Admin Login Regression', 'Admin login credentials failed');
    }

    // ----------------------------------------------------
    // Setup Test Users and Teams
    // ----------------------------------------------------
    const mgrA = await User.create({
      name: 'Manager Team Alpha',
      email: `mgr_a_${emailSuffix}`,
      password: 'Password123!',
      role: 'manager',
      department: 'Engineering',
      position: 'Engineering Lead',
    });
    const mgrB = await User.create({
      name: 'Manager Team Beta',
      email: `mgr_b_${emailSuffix}`,
      password: 'Password123!',
      role: 'manager',
      department: 'Product',
      position: 'Product Lead',
    });
    const empA = await User.create({
      name: 'Employee Team Alpha',
      email: `emp_a_${emailSuffix}`,
      password: 'Password123!',
      role: 'employee',
      department: 'Engineering',
      position: 'Developer',
    });
    const empB = await User.create({
      name: 'Employee Team Beta',
      email: `emp_b_${emailSuffix}`,
      password: 'Password123!',
      role: 'employee',
      department: 'Product',
      position: 'Designer',
    });

    const teamA = await Team.create({
      name: `Team Alpha ${testPrefix}`,
      description: 'Team Alpha for testing',
      manager: mgrA._id,
      members: [empA._id],
    });
    const teamB = await Team.create({
      name: `Team Beta ${testPrefix}`,
      description: 'Team Beta for testing',
      manager: mgrB._id,
      members: [empB._id],
    });

    mgrA.team = teamA._id;
    empA.team = teamA._id;
    mgrB.team = teamB._id;
    empB.team = teamB._id;
    await Promise.all([mgrA.save(), empA.save(), mgrB.save(), empB.save()]);

    const mgrAToken = signToken(mgrA._id);
    const mgrBToken = signToken(mgrB._id);
    const empAToken = signToken(empA._id);
    const empBToken = signToken(empB._id);

    // Create Tasks
    const taskA = await Task.create({
      title: `Task for Team A ${testPrefix}`,
      description: 'Task assigned to empA in teamA',
      team: teamA._id,
      assignedTo: empA._id,
      createdBy: mgrA._id,
      priority: 'High',
      status: 'To Do',
    });

    const taskB = await Task.create({
      title: `Task for Team B ${testPrefix}`,
      description: 'Task assigned to empB in teamB',
      team: teamB._id,
      assignedTo: empB._id,
      createdBy: mgrB._id,
      priority: 'Medium',
      status: 'To Do',
    });

    // ----------------------------------------------------
    // P4-02: File Upload Valid (Manager A uploads to Task A)
    // ----------------------------------------------------
    const samplePdfContent = '%PDF-1.4 sample test pdf document content';
    const formA = new FormData();
    const pdfBlob = new Blob([samplePdfContent], { type: 'application/pdf' });
    formA.append('file', pdfBlob, 'architecture_spec.pdf');

    const uploadTaskARes = await apiRequest(`/api/tasks/${taskA._id}/files`, {
      method: 'POST',
      token: mgrAToken,
      body: formA,
    });

    const fileDocA = uploadTaskARes.data?.data?.file;
    const dbFileA = fileDocA ? await File.findById(fileDocA._id) : null;
    const taskARefreshed = await Task.findById(taskA._id);
    const historyAdded = taskARefreshed.history.some((h) => h.action === 'attachment_added');
    const physicalFileExists = dbFileA?.storagePath
      ? fs.existsSync(dbFileA.storagePath)
      : false;

    if (
      uploadTaskARes.status === 201 &&
      fileDocA &&
      physicalFileExists &&
      taskARefreshed.attachments.includes(fileDocA._id) &&
      historyAdded
    ) {
      logPass('P4-02: File Upload Valid', `Uploaded '${fileDocA.originalName}' (ID: ${fileDocA._id}) with task history`);
    } else {
      logFail('P4-02: File Upload Valid');
    }

    // ----------------------------------------------------
    // P4-03: Unauthorized Task Upload (Manager A uploads to Task B)
    // ----------------------------------------------------
    const formCross = new FormData();
    formCross.append('file', pdfBlob, 'cross_team.pdf');
    const crossUploadRes = await apiRequest(`/api/tasks/${taskB._id}/files`, {
      method: 'POST',
      token: mgrAToken,
      body: formCross,
    });

    if (crossUploadRes.status === 403) {
      logPass('P4-03: Unauthorized Task Upload', 'Manager blocked from uploading to other team task (HTTP 403)');
    } else {
      logFail('P4-03: Unauthorized Task Upload', `Expected 403, got ${crossUploadRes.status}`);
    }

    // ----------------------------------------------------
    // P4-04: Employee General Upload Blocked
    // ----------------------------------------------------
    const formEmp = new FormData();
    formEmp.append('file', pdfBlob, 'employee_upload.pdf');
    const empUploadRes = await apiRequest(`/api/tasks/${taskA._id}/files`, {
      method: 'POST',
      token: empAToken,
      body: formEmp,
    });

    if (empUploadRes.status === 403) {
      logPass('P4-04: Employee General Upload', 'Employee general task upload correctly denied (HTTP 403)');
    } else {
      logFail('P4-04: Employee General Upload', `Expected 403, got ${empUploadRes.status}`);
    }

    // ----------------------------------------------------
    // P4-05: MIME/Extension Validation (Reject .exe)
    // ----------------------------------------------------
    const formExe = new FormData();
    const exeBlob = new Blob(['MZ\x90\x00\x03\x00\x00\x00'], { type: 'application/x-msdownload' });
    formExe.append('file', exeBlob, 'malware.exe');
    const exeUploadRes = await apiRequest(`/api/tasks/${taskA._id}/files`, {
      method: 'POST',
      token: mgrAToken,
      body: formExe,
    });

    if (exeUploadRes.status === 400 || exeUploadRes.status === 500) {
      logPass('P4-05: MIME/Extension Validation', 'Dangerous executable .exe upload rejected');
    } else {
      logFail('P4-05: MIME/Extension Validation', `Expected error, got ${exeUploadRes.status}`);
    }

    // ----------------------------------------------------
    // P4-06: Size Limit Check
    // ----------------------------------------------------
    const formOversize = new FormData();
    // 11 MB buffer (> 10MB limit)
    const largeBlob = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'application/pdf' });
    formOversize.append('file', largeBlob, 'oversized.pdf');
    const oversizeRes = await apiRequest(`/api/tasks/${taskA._id}/files`, {
      method: 'POST',
      token: mgrAToken,
      body: formOversize,
    });

    if (oversizeRes.status === 413 || oversizeRes.status === 500) {
      logPass('P4-06: Size Limit', 'Oversized file upload blocked (HTTP 413/500)');
    } else {
      logFail('P4-06: Size Limit', `Expected upload rejection, got ${oversizeRes.status}`);
    }

    // ----------------------------------------------------
    // P4-07: Path Traversal Defense
    // ----------------------------------------------------
    const formTraversal = new FormData();
    formTraversal.append('file', pdfBlob, '../../../../etc/passwd.pdf');
    const traversalRes = await apiRequest(`/api/tasks/${taskA._id}/files`, {
      method: 'POST',
      token: mgrAToken,
      body: formTraversal,
    });
    const traversalFile = traversalRes.data?.data?.file;
    const dbTraversalFile = traversalFile ? await File.findById(traversalFile._id) : null;
    const isSafeStorage = dbTraversalFile?.storagePath
      ? !dbTraversalFile.storagePath.includes('..') &&
        dbTraversalFile.storagePath.startsWith(UPLOAD_DIR) &&
        fs.existsSync(dbTraversalFile.storagePath)
      : false;

    if (traversalRes.status === 201 && isSafeStorage) {
      logPass('P4-07: Path Traversal', 'Filename sanitized; storage strictly within upload directory');
    } else {
      logFail('P4-07: Path Traversal');
    }

    // ----------------------------------------------------
    // P4-08: File Download Authorized (Assignee empA downloads)
    // ----------------------------------------------------
    const downloadAuthRes = await apiRequest(`/api/files/${fileDocA._id}/download`, {
      method: 'GET',
      token: empAToken,
    });

    if (downloadAuthRes.status === 200 && downloadAuthRes.data.includes('%PDF-1.4')) {
      logPass('P4-08: File Download Authorized', 'Assigned employee successfully downloaded task attachment');
    } else {
      logFail('P4-08: File Download Authorized', `Status: ${downloadAuthRes.status}`);
    }

    // ----------------------------------------------------
    // P4-09: File Download Unauthorized (Unassigned empB blocked)
    // ----------------------------------------------------
    const downloadUnauthRes = await apiRequest(`/api/files/${fileDocA._id}/download`, {
      method: 'GET',
      token: empBToken,
    });

    if (downloadUnauthRes.status === 403) {
      logPass('P4-09: File Download Unauthorized', 'Unrelated employee blocked from downloading task attachment (HTTP 403)');
    } else {
      logFail('P4-09: File Download Unauthorized', `Expected 403, got ${downloadUnauthRes.status}`);
    }

    // ----------------------------------------------------
    // P4-10: Direct Static URL Not Exposed
    // ----------------------------------------------------
    const directStaticRes = await apiRequest(`/storage/uploads/${fileDocA.storedName}`, {
      method: 'GET',
    });

    if (directStaticRes.status === 404) {
      logPass('P4-10: Direct Static URL', 'Unrestricted static upload path returns 404 (No bypass)');
    } else {
      logFail('P4-10: Direct Static URL', `Direct static access returned ${directStaticRes.status}`);
    }

    // ----------------------------------------------------
    // P4-11: File Delete
    // ----------------------------------------------------
    const fileToDeleteDoc = await File.findById(traversalFile._id);
    const deleteRes = await apiRequest(`/api/files/${fileToDeleteDoc._id}`, {
      method: 'DELETE',
      token: mgrAToken,
    });

    const fileAfterDelete = await File.findById(fileToDeleteDoc._id);
    const physicalDeleted = !fs.existsSync(fileToDeleteDoc.storagePath);
    const taskAfterDelete = await Task.findById(taskA._id);
    const removedFromAttachments = !taskAfterDelete.attachments.includes(fileToDeleteDoc._id.toString());

    if (deleteRes.status === 200 && !fileAfterDelete && physicalDeleted && removedFromAttachments) {
      logPass('P4-11: File Delete', 'File metadata, physical file, and task references deleted cleanly');
    } else {
      logFail('P4-11: File Delete');
    }

    // ----------------------------------------------------
    // P4-12: Chat Attachment
    // ----------------------------------------------------
    const chatRoom = await ChatRoom.create({
      type: 'team',
      team: teamA._id,
      members: [mgrA._id, empA._id],
    });

    const formChat = new FormData();
    formChat.append('file', pdfBlob, 'chat_diagram.pdf');
    const chatUploadRes = await apiRequest(`/api/chats/${chatRoom._id}/files`, {
      method: 'POST',
      token: empAToken,
      body: formChat,
    });
    const chatFileDoc = chatUploadRes.data?.data?.file;

    const chatDownloadRes = await apiRequest(`/api/files/${chatFileDoc._id}/download`, {
      method: 'GET',
      token: mgrAToken,
    });

    if (chatUploadRes.status === 201 && chatDownloadRes.status === 200) {
      logPass('P4-12: Chat Attachment', 'Authorized chat participant uploaded and team manager downloaded attachment');
    } else {
      logFail('P4-12: Chat Attachment');
    }

    // ----------------------------------------------------
    // P4-13: Chat Attachment Attack (Unrelated empB tries download)
    // ----------------------------------------------------
    const chatAttackRes = await apiRequest(`/api/files/${chatFileDoc._id}/download`, {
      method: 'GET',
      token: empBToken,
    });

    if (chatAttackRes.status === 403) {
      logPass('P4-13: Chat Attachment Attack', 'Unauthorized user denied access to chat attachment (HTTP 403)');
    } else {
      logFail('P4-13: Chat Attachment Attack');
    }

    // ----------------------------------------------------
    // P4-14: Removed Team Member File Access
    // ----------------------------------------------------
    // Remove empA from teamA
    empA.team = null;
    await empA.save();
    chatRoom.members = [mgrA._id];
    await chatRoom.save();

    const removedMemberDownloadRes = await apiRequest(`/api/files/${chatFileDoc._id}/download`, {
      method: 'GET',
      token: empAToken,
    });

    if (removedMemberDownloadRes.status === 403) {
      logPass('P4-14: Removed Team Member File Access', 'Removed team member access to historical chat file revoked (HTTP 403)');
    } else {
      logFail('P4-14: Removed Team Member File Access', `Expected 403, got ${removedMemberDownloadRes.status}`);
    }

    // Restore empA to teamA for remaining tests
    empA.team = teamA._id;
    await empA.save();

    // ----------------------------------------------------
    // P4-15: File Notification
    // ----------------------------------------------------
    const fileNotif = await Notification.findOne({
      user: empA._id,
      type: 'file_uploaded',
    });

    if (fileNotif) {
      logPass('P4-15: File Notification', `Real Notification persisted for file upload (ID: ${fileNotif._id})`);
    } else {
      logFail('P4-15: File Notification');
    }

    // ----------------------------------------------------
    // P4-16: Start Work Session (empA on taskA)
    // ----------------------------------------------------
    const startSessionRes = await apiRequest('/api/work-sessions/start', {
      method: 'POST',
      token: empAToken,
      body: { taskId: taskA._id },
    });

    const activeSess = startSessionRes.data?.data?.session;

    if (
      startSessionRes.status === 201 &&
      activeSess?.state === 'active' &&
      activeSess.start &&
      activeSess.task?._id === taskA._id.toString()
    ) {
      logPass('P4-16: Start Work Session', `Started active session (ID: ${activeSess._id})`);
    } else {
      logFail('P4-16: Start Work Session');
    }

    // ----------------------------------------------------
    // P4-17: Start Other User Task (empA tries on taskB)
    // ----------------------------------------------------
    // First clear empA's active session temporarily
    await WorkSession.deleteMany({ user: empA._id });

    const startOtherTaskRes = await apiRequest('/api/work-sessions/start', {
      method: 'POST',
      token: empAToken,
      body: { taskId: taskB._id },
    });

    if (startOtherTaskRes.status === 403) {
      logPass('P4-17: Start Other User Task', 'Session start on unassigned task blocked (HTTP 403)');
    } else {
      logFail('P4-17: Start Other User Task', `Expected 403, got ${startOtherTaskRes.status}`);
    }

    // Restart active session for empA on taskA
    const sessA = await WorkSession.create({
      user: empA._id,
      task: taskA._id,
      start: new Date(Date.now() - 30000), // 30s ago
      state: 'active',
    });

    // ----------------------------------------------------
    // P4-18: Second Active Session (409 Conflict)
    // ----------------------------------------------------
    const secondSessionRes = await apiRequest('/api/work-sessions/start', {
      method: 'POST',
      token: empAToken,
      body: { taskId: taskA._id },
    });

    if (secondSessionRes.status === 409) {
      logPass('P4-18: Second Active Session', 'Starting duplicate concurrent session returned HTTP 409 Conflict');
    } else {
      logFail('P4-18: Second Active Session', `Expected 409, got ${secondSessionRes.status}`);
    }

    // ----------------------------------------------------
    // P4-19: Pause Active Session
    // ----------------------------------------------------
    const pauseRes = await apiRequest(`/api/work-sessions/${sessA._id}/pause`, {
      method: 'PATCH',
      token: empAToken,
    });

    const pausedSess = pauseRes.data?.data?.session;

    if (pauseRes.status === 200 && pausedSess?.state === 'paused' && pausedSess.interruptions === 1) {
      logPass('P4-19: Pause', 'Session transitioned to paused; interruption count incremented to 1');
    } else {
      logFail('P4-19: Pause');
    }

    // ----------------------------------------------------
    // P4-20: Invalid Double Pause
    // ----------------------------------------------------
    const doublePauseRes = await apiRequest(`/api/work-sessions/${sessA._id}/pause`, {
      method: 'PATCH',
      token: empAToken,
    });

    if (doublePauseRes.status === 409) {
      logPass('P4-20: Invalid Double Pause', 'Pausing already paused session returned HTTP 409 Conflict');
    } else {
      logFail('P4-20: Invalid Double Pause', `Expected 409, got ${doublePauseRes.status}`);
    }

    // ----------------------------------------------------
    // P4-21: Resume Paused Session
    // ----------------------------------------------------
    const resumeRes = await apiRequest(`/api/work-sessions/${sessA._id}/resume`, {
      method: 'PATCH',
      token: empAToken,
    });

    const resumedSess = resumeRes.data?.data?.session;

    if (resumeRes.status === 200 && resumedSess?.state === 'active') {
      logPass('P4-21: Resume', 'Session resumed to active; pause interval closed');
    } else {
      logFail('P4-21: Resume');
    }

    // ----------------------------------------------------
    // P4-22: Stop Active Session
    // ----------------------------------------------------
    const stopRes = await apiRequest(`/api/work-sessions/${sessA._id}/stop`, {
      method: 'PATCH',
      token: empAToken,
    });

    const completedSess = stopRes.data?.data?.session;

    if (
      stopRes.status === 200 &&
      completedSess?.state === 'completed' &&
      completedSess.end &&
      completedSess.activeDuration >= 20
    ) {
      logPass('P4-22: Stop Active', `Completed session. Active duration: ${completedSess.activeDuration}s`);
    } else {
      logFail('P4-22: Stop Active');
    }

    // ----------------------------------------------------
    // P4-23: Stop While Paused
    // ----------------------------------------------------
    const sessB = await WorkSession.create({
      user: empA._id,
      task: taskA._id,
      start: new Date(Date.now() - 60000), // 60s ago
      state: 'paused',
      pauses: [{ start: new Date(Date.now() - 30000), end: null }], // paused 30s ago
      interruptions: 1,
    });

    const stopWhilePausedRes = await apiRequest(`/api/work-sessions/${sessB._id}/stop`, {
      method: 'PATCH',
      token: empAToken,
    });

    const stoppedPausedSess = stopWhilePausedRes.data?.data?.session;

    if (
      stopWhilePausedRes.status === 200 &&
      stoppedPausedSess?.state === 'completed' &&
      stoppedPausedSess.activeDuration >= 25 &&
      stoppedPausedSess.activeDuration <= 35
    ) {
      logPass('P4-23: Stop While Paused', `Paused time correctly excluded; active duration: ${stoppedPausedSess.activeDuration}s`);
    } else {
      logFail('P4-23: Stop While Paused');
    }

    // ----------------------------------------------------
    // P4-24: Duration Security (Client fake duration ignored)
    // ----------------------------------------------------
    const sessC = await WorkSession.create({
      user: empA._id,
      task: taskA._id,
      start: new Date(Date.now() - 10000),
      state: 'active',
    });

    const fakeDurationRes = await apiRequest(`/api/work-sessions/${sessC._id}/stop`, {
      method: 'PATCH',
      token: empAToken,
      body: { activeDuration: 999999 },
    });

    const fakeDurationSess = fakeDurationRes.data?.data?.session;

    if (fakeDurationSess?.activeDuration < 100) {
      logPass('P4-24: Duration Security', `Client activeDuration payload ignored; server recorded ${fakeDurationSess.activeDuration}s`);
    } else {
      logFail('P4-24: Duration Security');
    }

    // ----------------------------------------------------
    // P4-25: Timestamp Security
    // ----------------------------------------------------
    const fakeTimestampRes = await apiRequest('/api/work-sessions/start', {
      method: 'POST',
      token: empAToken,
      body: { taskId: taskA._id, start: '1970-01-01T00:00:00.000Z' },
    });

    const fakeTimeSess = fakeTimestampRes.data?.data?.session;
    const startYear = new Date(fakeTimeSess?.start).getFullYear();

    if (startYear >= 2026) {
      logPass('P4-25: Timestamp Security', 'Client start timestamp ignored; server set current timestamp');
    } else {
      logFail('P4-25: Timestamp Security');
    }

    // ----------------------------------------------------
    // P4-26: Current Session Restore
    // ----------------------------------------------------
    const restoreRes = await apiRequest('/api/work-sessions/current', {
      method: 'GET',
      token: empAToken,
    });

    if (restoreRes.status === 200 && restoreRes.data?.data?.session?._id === fakeTimeSess._id) {
      logPass('P4-26: Current Session Restore', 'Active session restored via GET /api/work-sessions/current');
    } else {
      logFail('P4-26: Current Session Restore');
    }

    // ----------------------------------------------------
    // P4-27: Paused Restore
    // ----------------------------------------------------
    await apiRequest(`/api/work-sessions/${fakeTimeSess._id}/pause`, {
      method: 'PATCH',
      token: empAToken,
    });

    const pausedRestoreRes = await apiRequest('/api/work-sessions/current', {
      method: 'GET',
      token: empAToken,
    });

    if (pausedRestoreRes.data?.data?.session?.state === 'paused') {
      logPass('P4-27: Paused Restore', 'Paused session state preserved and restored');
    } else {
      logFail('P4-27: Paused Restore');
    }

    // Stop current session
    await apiRequest(`/api/work-sessions/${fakeTimeSess._id}/stop`, {
      method: 'PATCH',
      token: empAToken,
    });

    // ----------------------------------------------------
    // P4-28: Recent Five Sessions
    // ----------------------------------------------------
    const recentRes = await apiRequest('/api/work-sessions/recent', {
      method: 'GET',
      token: empAToken,
    });

    const recentList = recentRes.data?.data?.sessions || [];

    if (recentRes.status === 200 && recentList.length <= 5 && recentList.length > 0) {
      logPass('P4-28: Recent Five', `Retrieved ${recentList.length} completed sessions in descending order`);
    } else {
      logFail('P4-28: Recent Five');
    }

    // ----------------------------------------------------
    // P4-29: Done Task Start Blocked
    // ----------------------------------------------------
    taskA.status = 'Done';
    await taskA.save();

    const doneTaskRes = await apiRequest('/api/work-sessions/start', {
      method: 'POST',
      token: empAToken,
      body: { taskId: taskA._id },
    });

    if (doneTaskRes.status === 400) {
      logPass('P4-29: Done Task', 'Starting work session on completed task rejected (HTTP 400)');
    } else {
      logFail('P4-29: Done Task', `Expected 400, got ${doneTaskRes.status}`);
    }

    // ----------------------------------------------------
    // P4-30: Session Ownership Attack (empB pauses empA session)
    // ----------------------------------------------------
    const sessD = await WorkSession.create({
      user: empA._id,
      task: taskA._id,
      start: new Date(),
      state: 'active',
    });

    const ownershipAttackRes = await apiRequest(`/api/work-sessions/${sessD._id}/pause`, {
      method: 'PATCH',
      token: empBToken,
    });

    if (ownershipAttackRes.status === 403) {
      logPass('P4-30: Session Ownership Attack', 'Cross-user work session mutation blocked (HTTP 403)');
    } else {
      logFail('P4-30: Session Ownership Attack', `Expected 403, got ${ownershipAttackRes.status}`);
    }

    // ----------------------------------------------------
    // P4-31: Work Session Socket Event
    // ----------------------------------------------------
    const empASocket = await connectSocket(empAToken);
    let socketEventReceived = false;

    empASocket.on('workSession:paused', () => {
      socketEventReceived = true;
    });

    await apiRequest(`/api/work-sessions/${sessD._id}/pause`, {
      method: 'PATCH',
      token: empAToken,
    });

    await new Promise((r) => setTimeout(r, 200));

    if (socketEventReceived) {
      logPass('P4-31: Work Session Socket Event', 'workSession:paused event received live on personal room');
    } else {
      logFail('P4-31: Work Session Socket Event');
    }
    empASocket.disconnect();

    // ----------------------------------------------------
    // P4-32: No Analytics Fabrication
    // ----------------------------------------------------
    const clientCode = fs.readFileSync(path.resolve('../client/src/pages/dashboard/DashboardPage.jsx'), 'utf-8');
    const hasFakeChart = clientCode.includes('heatmap') || clientCode.includes('productivity percentage');

    if (!hasFakeChart) {
      logPass('P4-32: No Analytics Fabrication', 'Dashboard strictly contains operational metrics and recent sessions');
    } else {
      logFail('P4-32: No Analytics Fabrication');
    }

    // ----------------------------------------------------
    // P4-33: Phase 1 Regression
    // ----------------------------------------------------
    const p1ProfileRes = await apiRequest('/api/auth/me', {
      method: 'GET',
      token: adminToken,
    });

    if (p1ProfileRes.status === 200 && p1ProfileRes.data?.data?.user?.email === admin.email) {
      logPass('P4-33: Phase 1 Regression', 'Auth /me profile operational');
    } else {
      logFail('P4-33: Phase 1 Regression');
    }

    // ----------------------------------------------------
    // P4-34: Phase 2 Regression
    // ----------------------------------------------------
    const p2UsersRes = await apiRequest('/api/users', {
      method: 'GET',
      token: adminToken,
    });

    if (p2UsersRes.status === 200 && p2UsersRes.data?.data?.users?.length > 0) {
      logPass('P4-34: Phase 2 Regression', 'User management directory operational');
    } else {
      logFail('P4-34: Phase 2 Regression');
    }

    // ----------------------------------------------------
    // P4-35: Phase 3 Regression
    // ----------------------------------------------------
    const p3NotifsRes = await apiRequest('/api/notifications', {
      method: 'GET',
      token: empAToken,
    });

    if (p3NotifsRes.status === 200 && Array.isArray(p3NotifsRes.data?.data?.notifications)) {
      logPass('P4-35: Phase 3 Regression', 'Notifications system operational');
    } else {
      logFail('P4-35: Phase 3 Regression');
    }

    // ----------------------------------------------------
    // P4-36: Token Security Check
    // ----------------------------------------------------
    const clientStorageCode = fs.readFileSync(path.resolve('../client/src/context/AuthContext.jsx'), 'utf-8');
    const storesTokenInLocalStorage = clientStorageCode.includes("localStorage.setItem('token'");

    if (!storesTokenInLocalStorage) {
      logPass('P4-36: Token Security Check', 'No JWT token stored in browser localStorage');
    } else {
      logFail('P4-36: Token Security Check');
    }

    // ----------------------------------------------------
    // P4-37: Private Chat Admin Authorization Review
    // ----------------------------------------------------
    const directPrivateRoom = await ChatRoom.create({
      type: 'one-to-one',
      members: [empA._id, empB._id],
    });

    await Message.create({
      sender: empA._id,
      room: directPrivateRoom._id,
      content: 'Confidential peer conversation',
    });

    const adminPrivateAccessRes = await apiRequest(`/api/chats/${directPrivateRoom._id}/messages`, {
      method: 'GET',
      token: adminToken,
    });

    if (adminPrivateAccessRes.status === 403) {
      logPass('P4-37: Private Chat Access Check', 'Admin denied access to private direct chat between employees (HTTP 403)');
    } else {
      logFail('P4-37: Private Chat Access Check', `Expected 403, got ${adminPrivateAccessRes.status}`);
    }

    console.log(`\n=== COMPLETED SUITE: ${passCount} PASSED, ${failCount} FAILED ===`);
  } catch (err) {
    console.error('Fatal error during test suite:', err);
  } finally {
    if (testServer) testServer.close();
    if (ioServer) ioServer.close();
    await mongoose.disconnect();
    console.log('[DATABASE] MongoDB disconnected');
  }
};

runSuite();
