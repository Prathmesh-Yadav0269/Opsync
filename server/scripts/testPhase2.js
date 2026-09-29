import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Team } from '../src/models/Team.js';
import { Task, TASK_STATUS } from '../src/models/Task.js';

const runPhase2Tests = async () => {
  console.log('=== RUNNING PHASE 1 + PHASE 2 ACCEPTANCE TESTS ===\n');

  await connectDB();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const ts = Date.now();
  const testEmail = (role) => `test_${role}_${ts}@opsync.local`;

  let adminToken = '';
  let managerAToken = '';
  let managerBToken = '';
  let employee1Token = '';
  let employee2Token = '';

  let managerAId = '';
  let managerBId = '';
  let employee1Id = '';
  let employee2Id = '';

  let teamAId = '';
  let teamBId = '';
  let task1Id = '';

  const results = [];
  const record = (id, name, pass, detail) => {
    results.push({ id, name, pass, detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id}: ${name} - ${detail}`);
  };

  try {
    // ----------------------------------------------------
    // P1-01: Health check
    // ----------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/health`);
      const body = await res.json();
      record('P1-01', 'Health Endpoint', res.status === 200 && body.status === 'ok', `Status ${res.status}`);
    }

    // ----------------------------------------------------
    // P1-02: Admin Login
    // ----------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@opsync.local',
          password: 'AdminSecurePass123!',
        }),
      });
      const body = await res.json();
      adminToken = body.data?.token;
      record(
        'P1-02',
        'Admin Login',
        res.status === 200 && !!adminToken && body.data?.user?.role === 'admin',
        `Admin authenticated successfully, role=${body.data?.user?.role}`
      );
    }

    // ----------------------------------------------------
    // P2-01: Admin Creates Manager A and Manager B
    // ----------------------------------------------------
    {
      const resA = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Manager Alpha',
          email: testEmail('mgr_a'),
          password: 'Password123!',
          role: 'manager',
          department: 'Product',
          position: 'Engineering Manager',
        }),
      });
      const bodyA = await resA.json();
      managerAId = bodyA.data?.user?._id;

      const resB = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Manager Beta',
          email: testEmail('mgr_b'),
          password: 'Password123!',
          role: 'manager',
          department: 'Operations',
          position: 'Operations Manager',
        }),
      });
      const bodyB = await resB.json();
      managerBId = bodyB.data?.user?._id;

      record(
        'P2-01',
        'Admin Create Manager',
        resA.status === 201 && bodyA.data?.user?.role === 'manager' && !('password' in bodyA.data.user),
        `Manager Alpha created (id: ${managerAId}), password hidden: true`
      );
    }

    // ----------------------------------------------------
    // P2-02: Admin Creates Employee 1 and Employee 2
    // ----------------------------------------------------
    {
      const res1 = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Employee One',
          email: testEmail('emp1'),
          password: 'Password123!',
          role: 'employee',
          department: 'Engineering',
          position: 'Frontend Engineer',
        }),
      });
      const body1 = await res1.json();
      employee1Id = body1.data?.user?._id;

      const res2 = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Employee Two',
          email: testEmail('emp2'),
          password: 'Password123!',
          role: 'employee',
          department: 'Engineering',
          position: 'Backend Engineer',
        }),
      });
      const body2 = await res2.json();
      employee2Id = body2.data?.user?._id;

      record(
        'P2-02',
        'Admin Create Employee',
        res1.status === 201 && body1.data?.user?.role === 'employee' && !('password' in body1.data.user),
        `Employee One created (id: ${employee1Id}), Employee Two (id: ${employee2Id})`
      );
    }

    // ----------------------------------------------------
    // P1-03: Login for Managers and Employees
    // ----------------------------------------------------
    {
      const loginA = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail('mgr_a'), password: 'Password123!' }),
      });
      const bodyLA = await loginA.json();
      managerAToken = bodyLA.data?.token;

      const loginB = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail('mgr_b'), password: 'Password123!' }),
      });
      const bodyLB = await loginB.json();
      managerBToken = bodyLB.data?.token;

      const loginE1 = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail('emp1'), password: 'Password123!' }),
      });
      const bodyE1 = await loginE1.json();
      employee1Token = bodyE1.data?.token;

      const loginE2 = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail('emp2'), password: 'Password123!' }),
      });
      const bodyE2 = await loginE2.json();
      employee2Token = bodyE2.data?.token;

      record(
        'P1-03',
        'Employee and Manager Logins',
        !!managerAToken && !!employee1Token && !!employee2Token,
        'All created accounts authenticated successfully'
      );
    }

    // ----------------------------------------------------
    // P2-03: Public Registration Role Escalation Prevention
    // ----------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Hacker User',
          email: testEmail('hacker'),
          password: 'Password123!',
          role: 'admin',
        }),
      });
      const body = await res.json();
      record(
        'P2-03',
        'Public Role Escalation Prevention',
        body.data?.user?.role === 'employee',
        `Role sent: 'admin', Role assigned: '${body.data?.user?.role}'`
      );
    }

    // ----------------------------------------------------
    // P2-04: Admin User List with lastLogin
    // ----------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = await res.json();
      const users = body.data?.users || [];
      const hasLastLogin = users.some((u) => u.lastLogin !== null);
      const noPasswords = users.every((u) => !('password' in u));
      record(
        'P2-04',
        'Admin User List',
        res.status === 200 && users.length >= 4 && hasLastLogin && noPasswords,
        `Retrieved ${users.length} users, lastLogin present: ${hasLastLogin}, passwords hidden: ${noPasswords}`
      );
    }

    // ----------------------------------------------------
    // P2-05: User Role Change by Admin
    // ----------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/users/${employee2Id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ department: 'Core Systems' }),
      });
      const body = await res.json();
      record(
        'P2-05',
        'Admin Update User',
        res.status === 200 && body.data?.user?.department === 'Core Systems',
        `Updated Employee Two department to 'Core Systems'`
      );
    }

    // ----------------------------------------------------
    // P2-06 & ATTACK G: User Deactivation
    // ----------------------------------------------------
    {
      // Deactivate Employee 2
      const deactRes = await fetch(`${baseUrl}/api/users/${employee2Id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ isActive: false }),
      });

      // Attempt login while deactivated
      const loginAttempt = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail('emp2'), password: 'Password123!' }),
      });

      // Reactivate Employee 2 for subsequent tests
      await fetch(`${baseUrl}/api/users/${employee2Id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ isActive: true }),
      });

      record(
        'P2-06',
        'Deactivate User (ATTACK G)',
        deactRes.status === 200 && loginAttempt.status === 401,
        `Deactivate status=${deactRes.status}, Inactive login rejected with status ${loginAttempt.status}`
      );
    }

    // ----------------------------------------------------
    // P2-07: Admin Creates Team A and Team B
    // ----------------------------------------------------
    {
      const resA = await fetch(`${baseUrl}/api/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `Team Alpha ${ts}`,
          description: 'Core Product Engineering Team',
          manager: managerAId,
          members: [employee1Id],
        }),
      });
      const bodyA = await resA.json();
      teamAId = bodyA.data?.team?._id;

      const resB = await fetch(`${baseUrl}/api/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `Team Beta ${ts}`,
          description: 'Operations and Infrastructure',
          manager: managerBId,
          members: [employee2Id],
        }),
      });
      const bodyB = await resB.json();
      teamBId = bodyB.data?.team?._id;

      record(
        'P2-07',
        'Admin Create Teams',
        resA.status === 201 && resB.status === 201 && !!teamAId && !!teamBId,
        `Team Alpha created (${teamAId}), Team Beta created (${teamBId})`
      );
    }

    // ----------------------------------------------------
    // P2-08 & P2-09: Assign Manager & Consistency of User.team
    // ----------------------------------------------------
    {
      const emp1InDb = await User.findById(employee1Id);
      const mgrAInDb = await User.findById(managerAId);
      const teamAInDb = await Team.findById(teamAId);

      const isConsistent =
        emp1InDb.team.toString() === teamAId.toString() &&
        mgrAInDb.team.toString() === teamAId.toString() &&
        teamAInDb.members.some((m) => m.toString() === employee1Id.toString());

      record(
        'P2-08/09',
        'Team Membership Consistency',
        isConsistent,
        `User.team == Team._id for both Manager and Employee members`
      );
    }

    // ----------------------------------------------------
    // P2-10 & ATTACK B: Manager Team Isolation
    // ----------------------------------------------------
    {
      // Manager A accesses Team A
      const resOwn = await fetch(`${baseUrl}/api/teams/${teamAId}`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });

      // Manager A attempts to access Team B (Forbidden)
      const resOther = await fetch(`${baseUrl}/api/teams/${teamBId}`, {
        headers: { Authorization: `Bearer ${managerAToken}` },
      });

      record(
        'P2-10',
        'Manager Team Isolation (ATTACK B)',
        resOwn.status === 200 && resOther.status === 403,
        `Own team status=${resOwn.status} (200), Other team status=${resOther.status} (403)`
      );
    }

    // ----------------------------------------------------
    // P2-11: Admin Creates Task
    // ----------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          title: 'Architect Foundation System',
          description: 'Define core contracts and schemas',
          assignedTo: employee1Id,
          team: teamAId,
          status: 'To Do',
          priority: 'High',
        }),
      });
      const body = await res.json();
      task1Id = body.data?.task?._id;

      record(
        'P2-11',
        'Admin Create Task',
        res.status === 201 && !!task1Id,
        `Task created by Admin (id: ${task1Id})`
      );
    }

    // ----------------------------------------------------
    // P2-12: Manager Creates Task for Own Team Member
    // ----------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          title: 'Implement Authentication Unit Tests',
          description: 'Cover login, register, and RBAC routes',
          assignedTo: employee1Id,
          priority: 'Urgent',
        }),
      });
      const body = await res.json();
      record(
        'P2-12',
        'Manager Create Task (Own Team)',
        res.status === 201 && body.data?.task?.assignedTo?._id === employee1Id,
        `Manager A assigned task to Team A employee (status: ${res.status})`
      );
    }

    // ----------------------------------------------------
    // P2-13 & ATTACK C: Manager Cross-Team Assignment Rejected
    // ----------------------------------------------------
    {
      // Manager A attempts to assign task to Employee 2 (who belongs to Team B)
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerAToken}`,
        },
        body: JSON.stringify({
          title: 'Cross Team Task Assignment Attempt',
          assignedTo: employee2Id,
          priority: 'Low',
        }),
      });
      record(
        'P2-13',
        'Cross-Team Assignment Rejected (ATTACK C)',
        res.status === 403,
        `Manager A assigning Team B employee returned status ${res.status} (expected 403)`
      );
    }

    // ----------------------------------------------------
    // P2-14 & ATTACK D: Employee Task Creation Prohibited
    // ----------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employee1Token}`,
        },
        body: JSON.stringify({
          title: 'Unauthorized Employee Task',
          assignedTo: employee1Id,
          team: teamAId,
        }),
      });
      record(
        'P2-14',
        'Employee Task Creation Blocked (ATTACK D)',
        res.status === 403,
        `Employee attempting task creation returned status ${res.status} (expected 403)`
      );
    }

    // ----------------------------------------------------
    // P2-15, P2-16 & ATTACK E: Employee Task Scoping
    // ----------------------------------------------------
    {
      // Employee 1 accesses Task 1 (assigned to Employee 1)
      const resOwn = await fetch(`${baseUrl}/api/tasks/${task1Id}`, {
        headers: { Authorization: `Bearer ${employee1Token}` },
      });

      // Employee 2 attempts to access Task 1 (assigned to Employee 1)
      const resOther = await fetch(`${baseUrl}/api/tasks/${task1Id}`, {
        headers: { Authorization: `Bearer ${employee2Token}` },
      });

      record(
        'P2-15/16',
        'Employee Task Scoping (ATTACK E)',
        resOwn.status === 200 && resOther.status === 403,
        `Own task status=${resOwn.status} (200), Other employee task status=${resOther.status} (403)`
      );
    }

    // ----------------------------------------------------
    // P2-17 & P2-18: Status Update & Timestamped Audit History
    // ----------------------------------------------------
    {
      // Employee 1 transitions task from 'To Do' to 'In Progress'
      const statusRes = await fetch(`${baseUrl}/api/tasks/${task1Id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employee1Token}`,
        },
        body: JSON.stringify({ status: 'In Progress' }),
      });
      const statusBody = await statusRes.json();
      const history = statusBody.data?.task?.history || [];
      const statusChangeEntry = history.find(
        (h) => h.action === 'status_changed' && h.oldValue === 'To Do' && h.newValue === 'In Progress'
      );

      record(
        'P2-17/18',
        'Task Status Update & Audit History',
        statusRes.status === 200 && !!statusChangeEntry && !!statusChangeEntry.changedAt,
        `Status updated to 'In Progress', audit entry recorded (changedBy: ${statusChangeEntry?.changedBy?.name}, changedAt: ${statusChangeEntry?.changedAt})`
      );
    }

    // ----------------------------------------------------
    // P2-19: Task Comments
    // ----------------------------------------------------
    {
      const commentRes = await fetch(`${baseUrl}/api/tasks/${task1Id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employee1Token}`,
        },
        body: JSON.stringify({
          content: 'Started working on the core interface implementations.',
        }),
      });
      const commentBody = await commentRes.json();
      const comments = commentBody.data?.comments || [];
      const hasComment = comments.some((c) => c.content.includes('Started working on the core'));

      record(
        'P2-19',
        'Task Comments',
        commentRes.status === 201 && hasComment,
        `Comment persisted with author and timestamp (count: ${comments.length})`
      );
    }

    // ----------------------------------------------------
    // P2-23 & ATTACK A: Employee Role Escalation via Profile
    // ----------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employee1Token}`,
        },
        body: JSON.stringify({
          name: 'Employee One Updated',
          role: 'admin',
        }),
      });
      const body = await res.json();
      const roleRemainedEmployee = body.data?.user?.role === 'employee';

      record(
        'P2-23',
        'Privilege Escalation Blocked (ATTACK A)',
        res.status === 200 && roleRemainedEmployee,
        `Employee attempted role='admin' via /api/users/me; role remained '${body.data?.user?.role}'`
      );
    }

    // ----------------------------------------------------
    // P2-24: Real Dashboard Operational Stats
    // ----------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = await res.json();
      const stats = body.data?.stats;

      record(
        'P2-24',
        'Real Operational Dashboard Stats',
        res.status === 200 && stats?.totalUsers >= 4 && stats?.totalTeams >= 2 && stats?.totalTasks >= 2,
        `Users=${stats?.totalUsers}, Teams=${stats?.totalTeams}, Tasks=${stats?.totalTasks}, strictly genuine DB counts`
      );
    }

    // ----------------------------------------------------
    // Referral Safety: Deleting User with Active Tasks Rejected
    // ----------------------------------------------------
    {
      const deleteAttempt = await fetch(`${baseUrl}/api/users/${employee1Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      record(
        'P2-Safety',
        'Referential Safety on Delete',
        deleteAttempt.status === 409,
        `Attempting to delete user with active tasks returned HTTP ${deleteAttempt.status} Conflict`
      );
    }

  } catch (err) {
    console.error('Phase 2 test runner error:', err);
  } finally {
    server.close();
    await mongoose.disconnect();
    console.log('\n=== COMPLETED PHASE 1 + PHASE 2 BACKEND TESTS ===');
    const passed = results.filter((r) => r.pass).length;
    console.log(`Summary: ${passed}/${results.length} tests passed.`);
  }
};

runPhase2Tests();
