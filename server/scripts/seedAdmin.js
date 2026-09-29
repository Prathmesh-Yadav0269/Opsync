import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/User.js';

dotenv.config();

const seedAdmin = async () => {
  const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!MONGODB_URI) {
    console.error('[SEED ERROR] MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('[SEED ERROR] Missing ADMIN_NAME, ADMIN_EMAIL, or ADMIN_PASSWORD in environment.');
    console.error('Please configure them in your server/.env file before running seed:admin.');
    process.exit(1);
  }

  if (ADMIN_PASSWORD.length < 8) {
    console.error('[SEED ERROR] ADMIN_PASSWORD must be at least 8 characters long.');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('[SEED] Connected to MongoDB.');

    const normalizedEmail = ADMIN_EMAIL.toLowerCase().trim();

    // Check if user already exists
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      if (existing.role === 'admin') {
        console.log(`[SEED INFO] Admin user already exists (${normalizedEmail}). No action needed.`);
      } else {
        existing.role = 'admin';
        await existing.save();
        console.log(`[SEED SUCCESS] Existing user (${normalizedEmail}) upgraded to admin role.`);
      }
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create new admin user
    await User.create({
      name: ADMIN_NAME.trim(),
      email: normalizedEmail,
      password: ADMIN_PASSWORD,
      role: 'admin',
      department: 'Executive Administration',
      position: 'System Administrator',
      isActive: true,
    });

    console.log(`[SEED SUCCESS] Admin account created successfully for: ${normalizedEmail}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(`[SEED ERROR] Failed to seed admin: ${error.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedAdmin();
