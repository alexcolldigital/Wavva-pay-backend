const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const User = require('../src/models/User');
const UserKYC = require('../src/models/UserKYC');

async function migrate() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/wavvapay';

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log('Connected to MongoDB', mongoUri);

  const users = await User.find();

  console.log(`Found ${users.length} users, migrating BVN/NIN fields...`);

  let updatedCount = 0;

  for (const user of users) {
    const userKYC = await UserKYC.findOne({ userId: user._id });
    const idleIdType = (userKYC?.idType || user.kyc?.idType || '').toLowerCase();
    const idNumber = userKYC?.idNumber || user.kyc?.idNumber;

    if (!idNumber || !['bvn', 'nin', 'national_id'].includes(idleIdType)) {
      continue;
    }

    if (idleIdType === 'bvn' && !user.bvn) {
      user.bvn = idNumber;
    }

    if ((idleIdType === 'nin' || idleIdType === 'national_id') && !user.nin) {
      user.nin = idNumber;
    }

    if (user.isModified('bvn') || user.isModified('nin')) {
      await user.save();
      updatedCount += 1;
      console.log(`Updated user ${user._id} ${idleIdType.toUpperCase()}: ${idNumber}`);
    }
  }

  console.log(`Migration completed. ${updatedCount} users updated.`);

  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
