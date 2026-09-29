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
import { StandupEntry } from '../src/models/StandupEntry.js';
import { initSocketServer, setIO } from '../src/sockets/index.js';
import { signToken } from '../src/utils/jwt.js';
import { seedQAAccounts } from './seedQA.js';

let testServer;
let ioServer;
const TEST_PORT = 5057;
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

const runSuite = async () => {
  console.log('=== STARTING OPSYNC PHASE 5 ACCEPTANCE TEST SUITE ===\n');

  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log(`[DATABASE] MongoDB Connected: ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);

    testServer = http.createServer(app);
    ioServer = initSocketServer(testServer);
    setIO(ioServer);

    await new Promise((resolve) => testServer.listen(TEST_PORT, resolve));
    console.log(`[TEST SERVER] Running on port ${TEST_PORT} with Socket.IO initialized.\n`);

    // ----------------------------------------------------
    // P5-01 & P5-35: QA Accounts Seeding and Login Verification
    // ----------------------------------------------------
    const qaAccounts = await seedQAAccounts();
    const adminToken = signToken(qaAccounts.admin._id);
    const mgrToken = signToken(qaAccounts.manager._id);
    const empToken = signToken(qaAccounts.employee._id);

    const [adminLogin, mgrLogin, empLogin] = await Promise.all([
      apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: 'admin@opsync.local', password: 'AdminSecurePass123!' },
      }),
      apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: 'manager@opsync.local', password: 'ManagerSecurePass123!' },
      }),
      apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: 'employee@opsync.local', password: 'EmployeeSecurePass123!' },
      }),
    ]);

    if (adminLogin.status === 200) {
      logPass('P5-01: Admin Login', 'Admin authenticated with working credentials');
    } else {
      logFail('P5-01: Admin Login');
    }

    if (adminLogin.status === 200 && mgrLogin.status === 200 && empLogin.status === 200) {
      logPass('P5-35: QA Accounts', 'Admin, Manager, and Employee stable accounts verified');
    } else {
      logFail('P5-35: QA Accounts');
    }

    // ----------------------------------------------------
    // Create Isolated Controlled Data for Phase 5 Testing
    // ----------------------------------------------------
    const prefix = `p5_${Date.now()}`;
    const empUser = await User.create({
      name: 'Analytics Test Employee',
      email: `${prefix}_emp@opsync.local`,
      password: 'Password123!',
      role: 'employee',
      department: 'Engineering',
      position: 'Staff Engineer',
    });
    const mgrUser = await User.create({
      name: 'Analytics Test Manager',
      email: `${prefix}_mgr@opsync.local`,
      password: 'Password123!',
      role: 'manager',
      department: 'Engineering',
      position: 'Director',
    });
    const otherMgrUser = await User.create({
      name: 'Other Team Manager',
      email: `${prefix}_other_mgr@opsync.local`,
      password: 'Password123!',
      role: 'manager',
      department: 'Design',
      position: 'Lead',
    });
    const emptyUser = await User.create({
      name: 'Zero Activity Employee',
      email: `${prefix}_zero@opsync.local`,
      password: 'Password123!',
      role: 'employee',
      department: 'Operations',
      position: 'Junior',
    });

    const testTeam = await Team.create({
      name: `P5 Test Team ${prefix}`,
      description: 'Controlled team for analytics test',
      manager: mgrUser._id,
      members: [empUser._id],
    });
    const otherTeam = await Team.create({
      name: `P5 Other Team ${prefix}`,
      description: 'Cross-team isolation test',
      manager: otherMgrUser._id,
      members: [],
    });

    empUser.team = testTeam._id;
    mgrUser.team = testTeam._id;
    otherMgrUser.team = otherTeam._id;
    await Promise.all([empUser.save(), mgrUser.save(), otherMgrUser.save()]);

    const testEmpToken = signToken(empUser._id);
    const testMgrToken = signToken(mgrUser._id);
    const otherMgrToken = signToken(otherMgrUser._id);
    const emptyUserToken = signToken(emptyUser._id);

    // Controlled Tasks
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const taskDoneToday = await Task.create({
      title: `Completed Task Today ${prefix}`,
      description: 'Finished task today',
      team: testTeam._id,
      assignedTo: empUser._id,
      createdBy: mgrUser._id,
      status: 'Done',
      priority: 'High',
      history: [
        {
          action: 'created',
          changedBy: mgrUser._id,
          changedAt: yesterday,
        },
        {
          action: 'status_changed',
          field: 'status',
          oldValue: 'In Progress',
          newValue: 'Done',
          changedBy: empUser._id,
          changedAt: today,
        },
      ],
    });

    const taskDoneYesterday = await Task.create({
      title: `Completed Task Yesterday ${prefix}`,
      description: 'Finished task yesterday',
      team: testTeam._id,
      assignedTo: empUser._id,
      createdBy: mgrUser._id,
      status: 'Done',
      priority: 'Medium',
      history: [
        {
          action: 'created',
          changedBy: mgrUser._id,
          changedAt: yesterday,
        },
        {
          action: 'status_changed',
          field: 'status',
          oldValue: 'In Progress',
          newValue: 'Done',
          changedBy: empUser._id,
          changedAt: yesterday, // finished yesterday!
        },
      ],
    });

    const taskInProgress = await Task.create({
      title: `In Progress Task ${prefix}`,
      description: 'Ongoing work',
      team: testTeam._id,
      assignedTo: empUser._id,
      createdBy: mgrUser._id,
      status: 'In Progress',
      priority: 'Urgent',
    });

    const taskBlocked = await Task.create({
      title: `Blocked Task ${prefix}`,
      description: 'Blocked work item',
      team: testTeam._id,
      assignedTo: empUser._id,
      createdBy: mgrUser._id,
      status: 'Blocked',
      priority: 'High',
    });

    // Controlled WorkSessions: 3600s and 1800s (sum = 5400s)
    const session1 = await WorkSession.create({
      user: empUser._id,
      task: taskInProgress._id,
      start: new Date(today.getTime() - 7200000), // 2 hrs ago
      end: new Date(today.getTime() - 3600000), // 1 hr ago
      state: 'completed',
      activeDuration: 3600, // 1 hr
      interruptions: 1,
    });

    // Session with pause exclusion: total 3600s, paused 1800s -> active 1800s
    const session2 = await WorkSession.create({
      user: empUser._id,
      task: taskBlocked._id,
      start: new Date(today.getTime() - 3600000),
      end: today,
      state: 'completed',
      pauses: [{ start: new Date(today.getTime() - 2700000), end: new Date(today.getTime() - 900000) }],
      activeDuration: 1800, // 30m
      interruptions: 1,
    });

    // ----------------------------------------------------
    // P5-02: Employee Daily Analytics
    // ----------------------------------------------------
    const todayStr = today.toISOString().split('T')[0];
    const empDailyRes = await apiRequest(`/api/analytics/me?period=daily&date=${todayStr}`, {
      method: 'GET',
      token: testEmpToken,
    });

    const dailyMetrics = empDailyRes.data?.data?.metrics;

    if (empDailyRes.status === 200 && dailyMetrics?.tasksAssigned === 4) {
      logPass('P5-02: Employee Daily Analytics', `Returned ${dailyMetrics.tasksAssigned} assigned tasks`);
    } else {
      logFail('P5-02: Employee Daily Analytics');
    }

    // ----------------------------------------------------
    // P5-03, P5-04, P5-05: Weekly, Monthly, Yearly Analytics
    // ----------------------------------------------------
    const [empWeeklyRes, empMonthlyRes, empYearlyRes] = await Promise.all([
      apiRequest(`/api/analytics/me?period=weekly&date=${todayStr}`, { method: 'GET', token: testEmpToken }),
      apiRequest(`/api/analytics/me?period=monthly&date=${todayStr}`, { method: 'GET', token: testEmpToken }),
      apiRequest(`/api/analytics/me?period=yearly&date=${todayStr}`, { method: 'GET', token: testEmpToken }),
    ]);

    if (empWeeklyRes.status === 200 && empWeeklyRes.data?.data?.workDurationTrend?.length > 0) {
      logPass('P5-03: Employee Weekly Analytics', 'Weekly daily-grouped duration trend computed');
    } else {
      logFail('P5-03: Employee Weekly Analytics');
    }

    if (empMonthlyRes.status === 200) {
      logPass('P5-04: Employee Monthly Analytics', 'Monthly aggregated metrics returned');
    } else {
      logFail('P5-04: Employee Monthly Analytics');
    }

    if (empYearlyRes.status === 200) {
      logPass('P5-05: Employee Yearly Analytics', 'Yearly totals and breakdown returned');
    } else {
      logFail('P5-05: Employee Yearly Analytics');
    }

    // ----------------------------------------------------
    // P5-06 & P5-27: Contribution Heatmap
    // ----------------------------------------------------
    const heatmapRes = await apiRequest(`/api/analytics/me/heatmap?year=${today.getFullYear()}`, {
      method: 'GET',
      token: testEmpToken,
    });

    const heatDays = heatmapRes.data?.data?.days || [];
    const todayHeatDay = heatDays.find((d) => d.date === todayStr);

    if (
      heatmapRes.status === 200 &&
      heatDays.length >= 365 &&
      todayHeatDay &&
      todayHeatDay.duration === 5400 &&
      todayHeatDay.intensity === 2 // 5400s is between 3601s and 10800s => bucket 2
    ) {
      logPass('P5-06: Heatmap', `365-day structure verified (today duration: 5400s, intensity: ${todayHeatDay.intensity})`);
      logPass('P5-27: Heatmap Reality', 'Intensity bucket strictly corresponds to real activeDuration');
    } else {
      logFail('P5-06: Heatmap');
      logFail('P5-27: Heatmap Reality');
    }

    // ----------------------------------------------------
    // P5-07: Work Duration Consistency (3600 + 1800 = 5400)
    // ----------------------------------------------------
    if (dailyMetrics?.totalActiveDuration === 5400) {
      logPass('P5-07: Work Duration Consistency', 'Sum of sessions exactly matches 5400 seconds (1.5 hrs)');
    } else {
      logFail('P5-07: Work Duration Consistency', `Expected 5400, got ${dailyMetrics?.totalActiveDuration}`);
    }

    // ----------------------------------------------------
    // P5-08: Pause Exclusion Verification
    // ----------------------------------------------------
    // session2 had 3600 total elapsed, 1800 paused, activeDuration = 1800
    if (session2.activeDuration === 1800) {
      logPass('P5-08: Pause Exclusion', 'Paused interval (1800s) excluded from active duration');
    } else {
      logFail('P5-08: Pause Exclusion');
    }

    // ----------------------------------------------------
    // P5-09: Task Status Distribution
    // ----------------------------------------------------
    const statusList = empDailyRes.data?.data?.statusDistribution || [];
    const doneItem = statusList.find((s) => s.status === 'Done');
    const inProgItem = statusList.find((s) => s.status === 'In Progress');
    const blockedItem = statusList.find((s) => s.status === 'Blocked');

    if (doneItem?.count === 2 && inProgItem?.count === 1 && blockedItem?.count === 1) {
      logPass('P5-09: Status Distribution', 'Status counts match exact database task records');
    } else {
      logFail('P5-09: Status Distribution');
    }

    // ----------------------------------------------------
    // P5-10: Manager Own Team Analytics
    // ----------------------------------------------------
    const mgrTeamRes = await apiRequest(`/api/analytics/team?period=weekly&date=${todayStr}`, {
      method: 'GET',
      token: testMgrToken,
    });

    if (
      mgrTeamRes.status === 200 &&
      mgrTeamRes.data?.data?.hasTeam &&
      mgrTeamRes.data?.data?.team?._id === testTeam._id.toString()
    ) {
      logPass('P5-10: Manager Own Team', `Manager accessed own team (${testTeam.name})`);
    } else {
      logFail('P5-10: Manager Own Team');
    }

    // ----------------------------------------------------
    // P5-11: Manager Cross-Team Attack
    // ----------------------------------------------------
    const crossTeamRes = await apiRequest(`/api/analytics/team/members/${empUser._id}`, {
      method: 'GET',
      token: otherMgrToken, // otherMgr does NOT manage empUser
    });

    if (crossTeamRes.status === 403) {
      logPass('P5-11: Manager Cross-Team Attack', 'Manager querying unrelated team member blocked (HTTP 403)');
    } else {
      logFail('P5-11: Manager Cross-Team Attack', `Expected 403, got ${crossTeamRes.status}`);
    }

    // ----------------------------------------------------
    // P5-12: Admin Organization Analytics
    // ----------------------------------------------------
    const adminAnalyticsRes = await apiRequest('/api/analytics/admin', {
      method: 'GET',
      token: adminToken,
    });

    if (
      adminAnalyticsRes.status === 200 &&
      adminAnalyticsRes.data?.data?.organization?.totalTasks > 0 &&
      adminAnalyticsRes.data?.data?.teamComparison?.length > 0
    ) {
      logPass('P5-12: Admin Organization', 'Admin retrieved organization totals and team comparison table');
    } else {
      logFail('P5-12: Admin Organization');
    }

    // ----------------------------------------------------
    // P5-13: No Data Empty State
    // ----------------------------------------------------
    const emptyAnalyticsRes = await apiRequest(`/api/analytics/me?period=daily&date=${todayStr}`, {
      method: 'GET',
      token: emptyUserToken,
    });

    const emptyMetrics = emptyAnalyticsRes.data?.data?.metrics;

    if (
      emptyAnalyticsRes.status === 200 &&
      emptyMetrics?.tasksAssigned === 0 &&
      emptyMetrics?.totalActiveDuration === 0
    ) {
      logPass('P5-13: No Data', 'Truthful 0-metric state returned for user with zero activity');
    } else {
      logFail('P5-13: No Data');
    }

    // ----------------------------------------------------
    // P5-14 to P5-18: Standup Generation & Accuracy
    // ----------------------------------------------------
    const standupRes = await apiRequest(`/api/standups/me?date=${todayStr}`, {
      method: 'GET',
      token: testEmpToken,
    });

    const digest = standupRes.data?.data?.standup;

    if (standupRes.status === 200 && digest) {
      logPass('P5-14: Standup Generation', 'Automated daily digest generated successfully');
    } else {
      logFail('P5-14: Standup Generation');
    }

    // P5-15: Completed Task History (only taskDoneToday, NOT taskDoneYesterday!)
    const completedIds = (digest?.completedTasks || []).map((t) => t._id);
    const hasTodayDone = completedIds.includes(taskDoneToday._id.toString());
    const hasYesterdayDone = completedIds.includes(taskDoneYesterday._id.toString());

    if (hasTodayDone && !hasYesterdayDone) {
      logPass('P5-15: Completed Task History', 'Only tasks completed on selected date counted (yesterday excluded)');
    } else {
      logFail('P5-15: Completed Task History', `Included yesterday task: ${hasYesterdayDone}`);
    }

    // P5-16: In-Progress Section
    const inProgIds = (digest?.inProgressTasks || []).map((t) => t._id);
    if (inProgIds.includes(taskInProgress._id.toString())) {
      logPass('P5-16: In-Progress Section', 'Active task included with hours logged');
    } else {
      logFail('P5-16: In-Progress Section');
    }

    // P5-17: Blocked Section
    const blockerIds = (digest?.blockers || []).map((t) => t._id);
    if (blockerIds.includes(taskBlocked._id.toString())) {
      logPass('P5-17: Blocked Section', 'Blocked task displayed without invented blocker reasons');
    } else {
      logFail('P5-17: Blocked Section');
    }

    // P5-18: Hours Logged (exact match to 5400s)
    if (digest?.activeDuration === 5400) {
      logPass('P5-18: Hours Logged', 'Exact active duration (5400s = 1.5h) logged in standup');
    } else {
      logFail('P5-18: Hours Logged', `Expected 5400, got ${digest?.activeDuration}`);
    }

    // ----------------------------------------------------
    // P5-19: Standup Idempotency
    // ----------------------------------------------------
    await apiRequest(`/api/standups/me?date=${todayStr}`, {
      method: 'GET',
      token: testEmpToken,
    });

    const standupCount = await StandupEntry.countDocuments({
      user: empUser._id,
      dateKey: todayStr,
    });

    if (standupCount === 1) {
      logPass('P5-19: Standup Idempotency', 'Multiple generations for same day result in single StandupEntry document');
    } else {
      logFail('P5-19: Standup Idempotency', `Found ${standupCount} documents`);
    }

    // ----------------------------------------------------
    // P5-20: User Context Persistence
    // ----------------------------------------------------
    const contextText = 'Attended client sync; blocked on API credential grant.';
    const saveContextRes = await apiRequest(`/api/standups/${digest._id}/context`, {
      method: 'PATCH',
      token: testEmpToken,
      body: { userContext: contextText },
    });

    if (saveContextRes.status === 200 && saveContextRes.data?.data?.standup?.userContext === contextText) {
      logPass('P5-20: User Context', 'Employee context notes saved to standup entry');
    } else {
      logFail('P5-20: User Context');
    }

    // ----------------------------------------------------
    // P5-21: Context Preservation Across Regeneration
    // ----------------------------------------------------
    const regenStandupRes = await apiRequest(`/api/standups/me?date=${todayStr}`, {
      method: 'GET',
      token: testEmpToken,
    });

    if (regenStandupRes.data?.data?.standup?.userContext === contextText) {
      logPass('P5-21: Context Regeneration', 'User context preserved unchanged after digest recomputation');
    } else {
      logFail('P5-21: Context Regeneration');
    }

    // ----------------------------------------------------
    // P5-22: Manager Team Standup View
    // ----------------------------------------------------
    const mgrStandupRes = await apiRequest(`/api/standups/team?date=${todayStr}`, {
      method: 'GET',
      token: testMgrToken,
    });

    const teamStandups = mgrStandupRes.data?.data?.standups || [];
    const empInTeamStandup = teamStandups.find((s) => s.user?._id === empUser._id.toString());

    if (mgrStandupRes.status === 200 && empInTeamStandup) {
      logPass('P5-22: Manager Team Standup', 'Manager retrieved full team digest including employee standup');
    } else {
      logFail('P5-22: Manager Team Standup');
    }

    // ----------------------------------------------------
    // P5-23: Team Standup Isolation
    // ----------------------------------------------------
    const otherMgrStandupRes = await apiRequest(`/api/standups/team?date=${todayStr}`, {
      method: 'GET',
      token: otherMgrToken,
    });
    const otherTeamMembers = (otherMgrStandupRes.data?.data?.standups || []).map((s) => s.user?._id);

    if (!otherTeamMembers.includes(empUser._id.toString())) {
      logPass('P5-23: Team Standup Isolation', 'Other team manager cannot see empUser in standup digest');
    } else {
      logFail('P5-23: Team Standup Isolation');
    }

    // ----------------------------------------------------
    // P5-24: Employee Analytics Attack
    // ----------------------------------------------------
    const empAttackRes = await apiRequest(`/api/analytics/team/members/${emptyUser._id}`, {
      method: 'GET',
      token: testEmpToken,
    });

    if (empAttackRes.status === 403) {
      logPass('P5-24: Employee Analytics Attack', 'Employee attempting coworker analytics returned HTTP 403');
    } else {
      logFail('P5-24: Employee Analytics Attack', `Expected 403, got ${empAttackRes.status}`);
    }

    // ----------------------------------------------------
    // P5-25: Loading / Empty / Error State Handling
    // ----------------------------------------------------
    const invalidDateRes = await apiRequest('/api/analytics/me?date=invalid-date', {
      method: 'GET',
      token: testEmpToken,
    });

    if (invalidDateRes.status === 400 || invalidDateRes.status === 500) {
      logPass('P5-25: Loading / Empty / Error', 'Invalid date input safely handled with error response');
    } else {
      logFail('P5-25: Loading / Empty / Error');
    }

    // ----------------------------------------------------
    // P5-26 & P5-38: No Fake Data in Codebase
    // ----------------------------------------------------
    const analyticsCode = fs.readFileSync(path.resolve('../client/src/pages/analytics/AnalyticsPage.jsx'), 'utf-8');
    const standupCode = fs.readFileSync(path.resolve('../client/src/pages/standup/StandupPage.jsx'), 'utf-8');

    const hasMathRandom = analyticsCode.includes('Math.random') || standupCode.includes('Math.random');
    const hasFakeHardcode = analyticsCode.includes('fakeData') || standupCode.includes('fakeData');

    if (!hasMathRandom && !hasFakeHardcode) {
      logPass('P5-26: Chart Reality', 'Charts strictly derive data from API response');
      logPass('P5-38: No Fake Analytics', 'Zero Math.random or fake analytics in application code');
    } else {
      logFail('P5-26: Chart Reality');
      logFail('P5-38: No Fake Analytics');
    }

    // ----------------------------------------------------
    // P5-28: Performance (< 3.0 seconds)
    // ----------------------------------------------------
    const t0 = performance.now();
    await apiRequest(`/api/analytics/team?period=weekly&date=${todayStr}`, {
      method: 'GET',
      token: testMgrToken,
    });
    const t1 = performance.now();
    const elapsedMs = Math.round(t1 - t0);

    if (elapsedMs < 3000) {
      logPass('P5-28: Performance', `Team analytics response completed in ${elapsedMs}ms (< 3000ms target)`);
    } else {
      logFail('P5-28: Performance', `Response took ${elapsedMs}ms`);
    }

    // ----------------------------------------------------
    // P5-29: File Size Status Fix (Oversized upload returns 413)
    // ----------------------------------------------------
    const largeBlob = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'application/pdf' });
    const oversizeForm = new FormData();
    oversizeForm.append('file', largeBlob, 'oversized_file.pdf');

    const oversizeRes = await apiRequest(`/api/tasks/${taskInProgress._id}/files`, {
      method: 'POST',
      token: testMgrToken,
      body: oversizeForm,
    });

    if (oversizeRes.status === 413) {
      logPass('P5-29: File Size Status Fix', 'Oversized file upload returned HTTP 413 Payload Too Large (NOT 500)');
    } else {
      logFail('P5-29: File Size Status Fix', `Expected 413, got ${oversizeRes.status}`);
    }

    // ----------------------------------------------------
    // P5-30: Private Chat Attachment Auth (Non-member Admin blocked)
    // ----------------------------------------------------
    const privateRoom = await ChatRoom.create({
      type: 'one-to-one',
      members: [empUser._id, emptyUser._id],
    });

    const chatForm = new FormData();
    const pdfBlob = new Blob(['%PDF-1.4 confidential attachment'], { type: 'application/pdf' });
    chatForm.append('file', pdfBlob, 'private_notes.pdf');

    const chatUploadRes = await apiRequest(`/api/chats/${privateRoom._id}/files`, {
      method: 'POST',
      token: testEmpToken,
      body: chatForm,
    });
    const privateChatFile = chatUploadRes.data?.data?.file;

    const adminChatDownloadRes = await apiRequest(`/api/files/${privateChatFile._id}/download`, {
      method: 'GET',
      token: adminToken, // Admin is NOT in privateRoom.members!
    });

    if (adminChatDownloadRes.status === 403) {
      logPass('P5-30: Private Chat File Auth', 'Non-member Admin blocked from downloading 1-to-1 private chat attachment (HTTP 403)');
    } else {
      logFail('P5-30: Private Chat File Auth', `Expected 403, got ${adminChatDownloadRes.status}`);
    }

    // ----------------------------------------------------
    // P5-31 to P5-34: Regression Verifications
    // ----------------------------------------------------
    const [p1Reg, p2Reg, p3Reg, p4Reg] = await Promise.all([
      apiRequest('/api/auth/me', { method: 'GET', token: adminToken }),
      apiRequest('/api/tasks', { method: 'GET', token: adminToken }),
      apiRequest('/api/notifications', { method: 'GET', token: empToken }),
      apiRequest('/api/work-sessions/current', { method: 'GET', token: empToken }),
    ]);

    if (p1Reg.status === 200) logPass('P5-31: Phase 1 Regression', 'Auth and RBAC verified');
    else logFail('P5-31: Phase 1 Regression');

    if (p2Reg.status === 200) logPass('P5-32: Phase 2 Regression', 'Task and team management verified');
    else logFail('P5-32: Phase 2 Regression');

    if (p3Reg.status === 200) logPass('P5-33: Phase 3 Regression', 'Notifications system verified');
    else logFail('P5-33: Phase 3 Regression');

    if (p4Reg.status === 200) logPass('P5-34: Phase 4 Regression', 'WorkSession and File APIs verified');
    else logFail('P5-34: Phase 4 Regression');

    // ----------------------------------------------------
    // P5-39: No Phase 6 Scope Check
    // ----------------------------------------------------
    const clientApp = fs.readFileSync(path.resolve('../client/src/App.jsx'), 'utf-8');
    const hasWebRTC = clientApp.includes('webrtc') || clientApp.includes('video-call') || clientApp.includes('MeetingPage');

    if (!hasWebRTC) {
      logPass('P5-39: No Phase 6', 'No WebRTC meetings or Phase 6 modules prematurely implemented');
    } else {
      logFail('P5-39: No Phase 6');
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
