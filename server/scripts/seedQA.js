import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Team } from '../src/models/Team.js';

export const seedQAAccounts = async () => {
  const adminEmail = process.env.QA_ADMIN_EMAIL || env.ADMIN_EMAIL || 'admin@opsync.local';
  const adminPassword = process.env.QA_ADMIN_PASSWORD || env.ADMIN_PASSWORD || 'AdminSecurePass123!';
  const managerEmail = process.env.QA_MANAGER_EMAIL || 'manager@opsync.local';
  const managerPassword = process.env.QA_MANAGER_PASSWORD || 'ManagerSecurePass123!';
  const employeeEmail = process.env.QA_EMPLOYEE_EMAIL || 'employee@opsync.local';
  const employeePassword = process.env.QA_EMPLOYEE_PASSWORD || 'EmployeeSecurePass123!';

  // 1. Admin
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: 'Opsync Admin',
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      department: 'Executive',
      position: 'System Administrator',
      isActive: true,
    });
  } else {
    admin.role = 'admin';
    admin.isActive = true;
    admin.password = adminPassword;
    await admin.save();
  }

  // 2. Manager
  let manager = await User.findOne({ email: managerEmail });
  if (!manager) {
    manager = await User.create({
      name: 'QA Manager',
      email: managerEmail,
      password: managerPassword,
      role: 'manager',
      department: 'Quality Assurance',
      position: 'QA Lead',
      isActive: true,
    });
  } else {
    manager.role = 'manager';
    manager.isActive = true;
    manager.password = managerPassword;
    await manager.save();
  }

  // 3. Employee
  let employee = await User.findOne({ email: employeeEmail });
  if (!employee) {
    employee = await User.create({
      name: 'QA Engineer',
      email: employeeEmail,
      password: employeePassword,
      role: 'employee',
      department: 'Quality Assurance',
      position: 'QA Automation Engineer',
      isActive: true,
    });
  } else {
    employee.role = 'employee';
    employee.isActive = true;
    employee.password = employeePassword;
    await employee.save();
  }

  // 4. Link Manager and Employee to a stable QA Team
  let qaTeam = await Team.findOne({ name: 'QA Operations Team' });
  if (!qaTeam) {
    qaTeam = await Team.create({
      name: 'QA Operations Team',
      description: 'Dedicated team for workspace QA testing and operational workflows.',
      manager: manager._id,
      members: [employee._id],
    });
  } else {
    qaTeam.manager = manager._id;
    if (!qaTeam.members.some((m) => m.toString() === employee._id.toString())) {
      qaTeam.members.push(employee._id);
    }
    await qaTeam.save();
  }

  manager.team = qaTeam._id;
  employee.team = qaTeam._id;
  await manager.save();
  await employee.save();

  console.log('[SEED QA] Stable accounts verified:');
  console.log(`  - Admin: ${admin.email}`);
  console.log(`  - Manager: ${manager.email} (Team: ${qaTeam.name})`);
  console.log(`  - Employee: ${employee.email} (Team: ${qaTeam.name})`);

  return { admin, manager, employee, qaTeam };
};

// If run directly from CLI
if (process.argv[1]?.endsWith('seedQA.js')) {
  mongoose
    .connect(env.MONGODB_URI)
    .then(async () => {
      await seedQAAccounts();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('[SEED QA FATAL]', err);
      process.exit(1);
    });
}
