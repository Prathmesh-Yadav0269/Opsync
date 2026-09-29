import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/User.js';

dotenv.config();

export const bootstrapAdmin = async () => {
  console.log('=== OPSYNC PRODUCTION ADMIN BOOTSTRAP ===\n');

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('[FATAL] MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  const adminName = process.env.ADMIN_NAME || 'Opsync Administrator';
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error('[FATAL] ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required to bootstrap production Admin.');
    console.error('Usage: ADMIN_NAME="Admin" ADMIN_EMAIL="admin@yourdomain.com" ADMIN_PASSWORD="YourStrongPassword123!" npm run bootstrap:admin');
    process.exit(1);
  }

  if (adminPassword.length < 8) {
    console.error('[FATAL] ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log(`[DB CONNECTED] Connected to MongoDB database: ${mongoose.connection.name}`);

    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log(`[BOOTSTRAP NOTICE] Admin user (${adminEmail}) already exists. No changes made.`);
      await mongoose.disconnect();
      process.exit(0);
    }

    // Check if any admin exists
    const anyAdmin = await User.findOne({ role: 'admin' });
    if (anyAdmin) {
      console.log(`[BOOTSTRAP NOTICE] An admin account (${anyAdmin.email}) already exists in this database.`);
    }

    const newAdmin = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      department: 'Executive',
      position: 'System Administrator',
      isActive: true,
      team: null,
    });

    console.log(`[BOOTSTRAP SUCCESS] Initial Admin user created successfully.`);
    console.log(`  Name:  ${newAdmin.name}`);
    console.log(`  Email: ${newAdmin.email}`);
    console.log(`  Role:  ${newAdmin.role}`);
    console.log('\nProduction bootstrap complete. Password has been securely hashed with bcrypt.');

    await mongoose.disconnect();
    console.log('[DATABASE] Disconnected cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('[FATAL] Error during Admin bootstrap:', err.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
};

bootstrapAdmin();
