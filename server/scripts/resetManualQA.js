import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Team } from '../src/models/Team.js';
import { Task } from '../src/models/Task.js';
import { WorkSession } from '../src/models/WorkSession.js';
import { StandupEntry } from '../src/models/StandupEntry.js';
import { ChatRoom } from '../src/models/ChatRoom.js';
import { Message } from '../src/models/Message.js';
import { Notification } from '../src/models/Notification.js';
import { File } from '../src/models/File.js';
import { Meeting } from '../src/models/Meeting.js';
import { ensureTeamChatRoom } from '../src/services/teamChatService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// HARD PRODUCTION SAFETY GUARD
if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
  console.error('[FATAL] Refusing execution: resetManualQA.js CANNOT be run in production mode.');
  process.exit(1);
}

export const resetManualQA = async () => {
  console.log('=== OPSYNC MANUAL QA DATABASE RESET ===\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
    console.log(`[DB CONNECTED] ${mongoose.connection.name}`);

    // 1. Purge all business test collections
    console.log('[PURGING] Removing temporary test business records...');
    await Task.deleteMany({});
    await WorkSession.deleteMany({});
    await StandupEntry.deleteMany({});
    await ChatRoom.deleteMany({});
    await Message.deleteMany({});
    await Notification.deleteMany({});
    await File.deleteMany({});
    await Meeting.deleteMany({});

    // Clean physical upload artifacts in storage/uploads/
    const uploadDir = path.resolve(__dirname, '../../storage/uploads');
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      for (const file of files) {
        if (file !== '.gitignore' && file !== '.gitkeep') {
          try {
            fs.unlinkSync(path.join(uploadDir, file));
          } catch (e) {}
        }
      }
    }

    // 2. Remove all non-QA teams
    console.log('[PURGING] Cleaning teams...');
    await Team.deleteMany({ name: { $ne: 'QA Operations Team' } });

    // 3. Remove all non-QA users
    console.log('[PURGING] Cleaning non-QA users...');
    const qaEmails = ['admin@opsync.local', 'manager@opsync.local', 'employee@opsync.local'];
    await User.deleteMany({ email: { $nin: qaEmails } });

    // 4. Ensure Single QA Team exists
    let qaTeam = await Team.findOne({ name: 'QA Operations Team' });
    if (!qaTeam) {
      qaTeam = new Team({
        name: 'QA Operations Team',
        description: 'Primary Quality Assurance & Operations Team',
      });
    }

    // 5. Ensure EXACTLY the 3 QA Users exist with authoritative credentials
    const adminPassword = process.env.QA_ADMIN_PASSWORD || 'AdminSecurePass123!';
    const managerPassword = process.env.QA_MANAGER_PASSWORD || 'ManagerSecurePass123!';
    const employeePassword = process.env.QA_EMPLOYEE_PASSWORD || 'EmployeeSecurePass123!';

    // ADMIN
    let admin = await User.findOne({ email: 'admin@opsync.local' });
    if (!admin) {
      admin = new User({
        name: 'Opsync Admin',
        email: 'admin@opsync.local',
        role: 'admin',
        department: 'Executive',
        position: 'System Administrator',
        isActive: true,
      });
    }
    admin.name = 'Opsync Admin';
    admin.role = 'admin';
    admin.department = 'Executive';
    admin.position = 'System Administrator';
    admin.isActive = true;
    admin.team = null;
    admin.avatar = null;
    admin.settings = {
      theme: 'system',
      notifications: {
        taskAssignments: true,
        taskDeadlines: true,
        messages: true,
        fileUploads: true,
        teamMembership: true,
      },
    };
    admin.password = adminPassword;
    await admin.save();

    // MANAGER
    let manager = await User.findOne({ email: 'manager@opsync.local' });
    if (!manager) {
      manager = new User({
        name: 'QA Manager',
        email: 'manager@opsync.local',
        role: 'manager',
        department: 'Quality Assurance',
        position: 'QA Lead',
        isActive: true,
      });
    }
    manager.name = 'QA Manager';
    manager.role = 'manager';
    manager.department = 'Quality Assurance';
    manager.position = 'QA Lead';
    manager.isActive = true;
    manager.team = qaTeam._id;
    manager.avatar = null;
    manager.settings = {
      theme: 'system',
      notifications: {
        taskAssignments: true,
        taskDeadlines: true,
        messages: true,
        fileUploads: true,
        teamMembership: true,
      },
    };
    manager.password = managerPassword;
    await manager.save();

    // EMPLOYEE
    let employee = await User.findOne({ email: 'employee@opsync.local' });
    if (!employee) {
      employee = new User({
        name: 'QA Employee',
        email: 'employee@opsync.local',
        role: 'employee',
        department: 'Quality Assurance',
        position: 'QA Engineer',
        isActive: true,
      });
    }
    employee.name = 'QA Employee';
    employee.role = 'employee';
    employee.department = 'Quality Assurance';
    employee.position = 'QA Engineer';
    employee.isActive = true;
    employee.team = qaTeam._id;
    employee.avatar = null;
    employee.settings = {
      theme: 'system',
      notifications: {
        taskAssignments: true,
        taskDeadlines: true,
        messages: true,
        fileUploads: true,
        teamMembership: true,
      },
    };
    employee.password = employeePassword;
    await employee.save();

    // 6. Synchronize Team relationships
    qaTeam.manager = manager._id;
    qaTeam.members = [employee._id];
    await qaTeam.save();

    // Re-verify User references
    manager.team = qaTeam._id;
    await manager.save();
    employee.team = qaTeam._id;
    await employee.save();

    // 7. Ensure Authoritative Primary Team ChatRoom exists for QA Operations Team
    const qaChatRoom = await ensureTeamChatRoom(qaTeam);
    console.log(`[CHAT ROOM] Synchronized primary Team ChatRoom: ${qaChatRoom._id}`);

    // 8. Verify collection counts
    const counts = {
      Users: await User.countDocuments(),
      Teams: await Team.countDocuments(),
      Tasks: await Task.countDocuments(),
      WorkSessions: await WorkSession.countDocuments(),
      StandupEntries: await StandupEntry.countDocuments(),
      ChatRooms: await ChatRoom.countDocuments(),
      Messages: await Message.countDocuments(),
      Notifications: await Notification.countDocuments(),
      Files: await File.countDocuments(),
      Meetings: await Meeting.countDocuments(),
    };

    console.log('\n=== DATABASE RESET COMPLETE ===');
    console.log('Final Collection Counts:');
    for (const [col, cnt] of Object.entries(counts)) {
      console.log(`  ${col}: ${cnt}`);
    }

    console.log('\nVerified QA Users:');
    console.log('  - Admin: admin@opsync.local (role: admin, team: none)');
    console.log(`  - Manager: manager@opsync.local (role: manager, team: ${qaTeam.name})`);
    console.log(`  - Employee: employee@opsync.local (role: employee, team: ${qaTeam.name})`);
    console.log(`QA Team: ${qaTeam.name} | Manager: ${manager.name} | Members: ${qaTeam.members.length}`);

    return { counts, users: { admin, manager, employee }, team: qaTeam };
  } catch (err) {
    console.error('[ERROR in resetManualQA]', err);
    throw err;
  }
};

// Direct script execution
if (process.argv[1] && process.argv[1].endsWith('resetManualQA.js')) {
  resetManualQA()
    .then(async () => {
      await mongoose.disconnect();
      console.log('\n[DONE] Disconnected from MongoDB. Clean exit.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
