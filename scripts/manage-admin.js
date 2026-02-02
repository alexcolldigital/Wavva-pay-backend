require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

/**
 * Script to promote a user to admin or demote them
 * Usage: node scripts/manage-admin.js <email> [true|false]
 * Examples:
 *   node scripts/manage-admin.js user@example.com true    (promote to admin)
 *   node scripts/manage-admin.js user@example.com false   (demote from admin)
 */
const manageAdmin = async () => {
  try {
    const email = process.argv[2];
    const isAdmin = process.argv[3] === 'true';

    if (!email) {
      logger.error('❌ Error: Email is required');
      logger.info('Usage: node scripts/manage-admin.js <email> [true|false]');
      process.exit(1);
    }

    logger.info(`🔄 Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('✅ Connected to MongoDB');

    const user = await User.findOne({ email });

    if (!user) {
      logger.error(`❌ User not found with email: ${email}`);
      await mongoose.connection.close();
      process.exit(1);
    }

    const previousStatus = user.isAdmin;
    user.isAdmin = isAdmin;
    await user.save();

    logger.info('✅ User updated successfully!');
    logger.info(`📧 Email: ${user.email}`);
    logger.info(`👤 Name: ${user.firstName} ${user.lastName}`);
    logger.info(`👨‍💼 Admin Status: ${previousStatus} → ${isAdmin}`);

    await mongoose.connection.close();
    logger.info('🔌 Database connection closed');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Error:', err.message);
    process.exit(1);
  }
};

manageAdmin();
