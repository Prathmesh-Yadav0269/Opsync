import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';

const runTests = async () => {
  console.log('=== RUNNING PHASE 1 BACKEND ACCEPTANCE TESTS ===\n');

  await connectDB();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const cleanEmail = (prefix) => `${prefix}_${Date.now()}@opsync.test`;

  let employeeToken = '';
  let employeeCookie = '';
  let adminToken = '';
  let testEmpEmail = cleanEmail('emp1');
  let testEmpPassword = 'Password123!';

  const results = [];

  const record = (id, name, pass, detail) => {
    results.push({ id, name, pass, detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] Test ${id}: ${name} - ${detail}`);
  };

  try {
    // TEST 1: Health check
    {
      const res = await fetch(`${baseUrl}/api/health`);
      const body = await res.json();
      record(1, 'Health Check', res.status === 200 && body.status === 'ok', `Status ${res.status}`);
    }

    // TEST 2: Database Connection
    {
      const isConnected = mongoose.connection.readyState === 1;
      record(2, 'Database Connection', isConnected, `ReadyState: ${mongoose.connection.readyState}`);
    }

    // TEST 3: Employee Registration
    {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Employee One',
          email: testEmpEmail,
          password: testEmpPassword,
        }),
      });
      const body = await res.json();
      const cookie = res.headers.get('set-cookie');
      if (cookie) employeeCookie = cookie.split(';')[0];
      employeeToken = body.data?.token;

      const userInDb = await User.findOne({ email: testEmpEmail }).select('+password');
      const passHashed = userInDb?.password && userInDb.password !== testEmpPassword && userInDb.password.startsWith('$2');

      record(
        3,
        'Employee Registration',
        res.status === 201 && body.data?.user?.role === 'employee' && passHashed,
        `Status ${res.status}, role=${body.data?.user?.role}, password hashed=${passHashed}`
      );
    }

    // TEST 4: Role Escalation Attack Prevention
    {
      const hackerEmail = cleanEmail('hacker');
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Escalation Attempt',
          email: hackerEmail,
          password: 'Password123!',
          role: 'admin',
        }),
      });
      const body = await res.json();
      const userInDb = await User.findOne({ email: hackerEmail });
      record(
        4,
        'Role Escalation Prevention',
        body.data?.user?.role === 'employee' && userInDb?.role === 'employee',
        `Payload sent role=admin, created user role=${userInDb?.role}`
      );
    }

    // TEST 5: Duplicate Email Rejection
    {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Duplicate Employee',
          email: testEmpEmail,
          password: 'AnotherPassword123!',
        }),
      });
      record(5, 'Duplicate Email Rejection', res.status === 409, `Status ${res.status}`);
    }

    // TEST 6: Successful Login & Audit Fields
    {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmpEmail,
          password: testEmpPassword,
        }),
      });
      const body = await res.json();
      const user = body.data?.user;
      record(
        6,
        'Successful Login',
        res.status === 200 && user?.loginCount >= 1 && user?.lastLogin !== null,
        `Status ${res.status}, loginCount=${user?.loginCount}, lastLogin=${user?.lastLogin}`
      );
    }

    // TEST 7: Wrong Password Rejection
    {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmpEmail,
          password: 'WrongPassword999!',
        }),
      });
      record(7, 'Wrong Password Rejection', res.status === 401, `Status ${res.status}`);
    }

    // TEST 8: Protected Route Without Auth
    {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      record(8, 'Protected Route Without Auth', res.status === 401, `Status ${res.status}`);
    }

    // TEST 9: Protected Route With Invalid JWT
    {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: 'Bearer invalid.token.payload' },
      });
      record(9, 'Protected Route With Invalid JWT', res.status === 401, `Status ${res.status}`);
    }

    // Login as seeded admin for RBAC tests
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
    }

    // TEST 10: Role Authorization (RBAC)
    {
      // Employee attempts admin route
      const empRes = await fetch(`${baseUrl}/api/auth/admin-check`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      // Admin attempts admin route
      const adminRes = await fetch(`${baseUrl}/api/auth/admin-check`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      record(
        10,
        'Role Authorization (RBAC)',
        empRes.status === 403 && adminRes.status === 200,
        `Employee status=${empRes.status} (expected 403), Admin status=${adminRes.status} (expected 200)`
      );
    }

    // TEST 11: Password Field Absence in API Responses
    {
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      const body = await meRes.json();
      const hasPassword = 'password' in (body.data?.user || {});
      record(
        11,
        'Password Field Absence',
        !hasPassword,
        `User response contains password: ${hasPassword}`
      );
    }

    // TEST 12: Profile Update & Role Protection
    {
      const res = await fetch(`${baseUrl}/api/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employeeToken}`,
        },
        body: JSON.stringify({
          name: 'Updated Name',
          department: 'Engineering',
          position: 'Software Developer',
          role: 'admin', // Attempt unauthorized role escalation via profile update
        }),
      });
      const body = await res.json();
      const user = body.data?.user;
      record(
        12,
        'Profile Update & Whitelist',
        res.status === 200 && user?.name === 'Updated Name' && user?.role === 'employee',
        `Name updated to '${user?.name}', role remained '${user?.role}'`
      );
    }

    // TEST 13: Password Change
    {
      const newPassword = 'BrandNewPassword123!';
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employeeToken}`,
        },
        body: JSON.stringify({
          currentPassword: testEmpPassword,
          newPassword: newPassword,
        }),
      });

      // Try login with old password
      const oldLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmpEmail, password: testEmpPassword }),
      });

      // Try login with new password
      const newLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmpEmail, password: newPassword }),
      });

      record(
        13,
        'Password Change',
        res.status === 200 && oldLogin.status === 401 && newLogin.status === 200,
        `Change status=${res.status}, Old login=${oldLogin.status}, New login=${newLogin.status}`
      );
    }

    // TEST 14: Logout
    {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
      });
      const cookieHeader = res.headers.get('set-cookie');
      const cookieCleared = cookieHeader && (cookieHeader.includes('token=;') || cookieHeader.includes('Expires=Thu, 01 Jan 1970'));
      record(14, 'Logout Clears Cookie', res.status === 200 && cookieCleared, `Status ${res.status}, cookie cleared`);
    }

  } catch (err) {
    console.error('Test runner failed:', err);
  } finally {
    server.close();
    await mongoose.disconnect();
    console.log('\n=== COMPLETED BACKEND TESTS ===');
    const passed = results.filter((r) => r.pass).length;
    console.log(`Summary: ${passed}/${results.length} tests passed.`);
  }
};

runTests();
