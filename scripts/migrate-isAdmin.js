require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

/**
 * Migration script to ensure all users have the isAdmin field
 * Run this script once to update existing users in the database
 * Usage: node scripts/migrate-isAdmin.js
 */
const migrate = async () => {
  try {
    logger.info('🔄 Starting isAdmin field migration...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('✅ Connected to MongoDB');

    // Update all users without isAdmin field to have isAdmin: false
    const result = await User.updateMany(
      { isAdmin: { $exists: false } },
      { $set: { isAdmin: false } }
    );

    logger.info(`✅ Migration completed!`);
    logger.info(`📊 Updated ${result.modifiedCount} documents`);
    logger.info(`📊 Total matched: ${result.matchedCount}`);

    // Get current admin count
    const adminCount = await User.countDocuments({ isAdmin: true });
    const totalUsers = await User.countDocuments();

    logger.info(`👥 Total users: ${totalUsers}`);
    logger.info(`👨‍💼 Admin users: ${adminCount}`);

    if (adminCount === 0) {
      logger.warn('⚠️  WARNING: No admin users found!');
      logger.info('💡 To make a user admin, run:');
      logger.info('   db.users.updateOne({ email: "your-email@example.com" }, { $set: { isAdmin: true } })');
    }

    await mongoose.connection.close();
    logger.info('🔌 Database connection closed');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
};

migrate();
