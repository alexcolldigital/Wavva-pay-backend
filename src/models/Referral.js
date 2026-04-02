const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  referredUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  referralCode: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'expired'],
    default: 'pending'
  },
  rewardAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  rewardCurrency: {
    type: String,
    enum: ['NGN', 'USD'],
    default: 'NGN'
  },
  completedAt: Date,
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  }
}, {
  timestamps: true
});

// Indexes
referralSchema.index({ referrerId: 1, status: 1 });
referralSchema.index({ referralCode: 1 });
referralSchema.index({ expiresAt: 1 });

// Static method to generate referral code
referralSchema.statics.generateReferralCode = function() {
  return 'WAVVA' + Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Static method to get referral stats
referralSchema.statics.getReferralStats = async function(userId) {
  try {
    // Convert userId to ObjectId if it's a string
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    const stats = await this.aggregate([
      { $match: { referrerId: userObjectId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRewards: { $sum: '$rewardAmount' }
        }
      }
    ]);

    return {
      totalReferrals: stats.reduce((sum, stat) => sum + stat.count, 0),
      completedReferrals: stats.find(s => s._id === 'completed')?.count || 0,
      pendingReferrals: stats.find(s => s._id === 'pending')?.count || 0,
      totalRewards: stats.find(s => s._id === 'completed')?.totalRewards || 0,
      code: 'WAVVA' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      earnings: stats.find(s => s._id === 'completed')?.totalRewards || 0,
      pendingRewards: stats.find(s => s._id === 'pending')?.totalRewards || 0
    };
  } catch (error) {
    console.error('Error calculating referral stats:', error);
    // Return default stats if there's an error
    return {
      totalReferrals: 0,
      completedReferrals: 0,
      pendingReferrals: 0,
      totalRewards: 0,
      code: 'WAVVA' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      earnings: 0,
      pendingRewards: 0
    };
  }
};

module.exports = mongoose.model('Referral', referralSchema);