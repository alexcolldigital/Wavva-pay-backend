const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../src/models/User');
const { assignDefaultWavvaTag } = require('../src/utils/wavvaTag');
const logger = require('../src/utils/logger');

/**
 * Migration script to assign wavva tags to existing users without one
 * Usage: npm run migrate:wavva-tags
 */
async function migrateWavvaTags() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/wavvapay';
    console.log('Connecting to MongoDB:', mongoUri);
    
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB');

    // Find all users without wavvaTag
    const usersWithoutTag = await User.find({ wavvaTag: { $exists: false } }).limit(1000);
    console.log(`\n📋 Found ${usersWithoutTag.length} users without Wavva Tags\n`);

    if (usersWithoutTag.length === 0) {
      console.log('✓ All users already have Wavva Tags!');
      await mongoose.disconnect();
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Migrate each user
    for (let i = 0; i < usersWithoutTag.length; i++) {
      const user = usersWithoutTag[i];
      try {
        // Generate and assign wavva tag
        const wavvaTag = await assignDefaultWavvaTag(User, {
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        });

        user.wavvaTag = wavvaTag;
        await user.save();

        successCount++;
        const progress = `[${i + 1}/${usersWithoutTag.length}]`;
        console.log(`${progress} ✓ ${user.firstName} ${user.lastName} → ${wavvaTag}`);
      } catch (err) {
        errorCount++;
        console.error(`✗ Error migrating ${user.firstName} ${user.lastName}:`, err.message);
      }
    }

    console.log(`\n📊 Migration Complete:`);
    console.log(`   ✓ Successful: ${successCount}`);
    console.log(`   ✗ Failed: ${errorCount}`);
    console.log(`   Total: ${successCount + errorCount}`);

    // Check for any remaining users without tags
    const remaining = await User.countDocuments({ wavvaTag: { $exists: false } });
    if (remaining > 0) {
      console.log(`\n⚠️  ${remaining} users still need migration (re-run this script)`);
    } else {
      console.log(`\n✓ All users migrated successfully!`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

// Run migration
migrateWavvaTags();
