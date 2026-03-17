const Referral = require('../models/Referral');
const User = require('../models/User');

// Generate referral code for user
const generateReferralCode = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user already has a referral code
    if (user.referralCode) {
      return res.json({
        success: true,
        referralCode: user.referralCode,
        message: 'Referral code already exists'
      });
    }

    // Generate new referral code
    const referralCode = Referral.generateReferralCode();

    // Update user with referral code
    user.referralCode = referralCode;
    await user.save();

    res.json({
      success: true,
      referralCode,
      message: 'Referral code generated successfully'
    });
  } catch (err) {
    console.error('Generate referral code error:', err);
    res.status(500).json({ error: 'Failed to generate referral code' });
  }
};

// Get user's referral stats
const getReferralStats = async (req, res) => {
  try {
    const userId = req.userId;

    const stats = await Referral.getReferralStats(userId);

    // Get user's referral code
    const user = await User.findById(userId).select('referralCode');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      referralCode: user.referralCode,
      stats
    });
  } catch (err) {
    console.error('Get referral stats error:', err);
    res.status(500).json({ error: 'Failed to fetch referral stats' });
  }
};

// Get user's referrals list
const getReferrals = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 20, offset = 0 } = req.query;

    const referrals = await Referral.find({ referrerId: userId })
      .populate('referredUserId', 'firstName lastName username email createdAt')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await Referral.countDocuments({ referrerId: userId });

    res.json({
      success: true,
      referrals: referrals.map(ref => ({
        id: ref._id,
        referredUser: {
          id: ref.referredUserId._id,
          firstName: ref.referredUserId.firstName,
          lastName: ref.referredUserId.lastName,
          username: ref.referredUserId.username,
          email: ref.referredUserId.email,
          joinedAt: ref.referredUserId.createdAt
        },
        status: ref.status,
        rewardAmount: ref.rewardAmount,
        rewardCurrency: ref.rewardCurrency,
        completedAt: ref.completedAt,
        createdAt: ref.createdAt
      })),
      total,
      hasMore: total > parseInt(offset) + referrals.length
    });
  } catch (err) {
    console.error('Get referrals error:', err);
    res.status(500).json({ error: 'Failed to fetch referrals' });
  }
};

// Use referral code (when a new user signs up)
const useReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const newUserId = req.userId;

    if (!referralCode) {
      return res.status(400).json({ error: 'Referral code is required' });
    }

    // Find the referrer by referral code
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    if (!referrer) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    // Check if user already has a referral
    const existingReferral = await Referral.findOne({ referredUserId: newUserId });
    if (existingReferral) {
      return res.status(400).json({ error: 'You have already used a referral code' });
    }

    // Create referral record
    const referral = new Referral({
      referrerId: referrer._id,
      referredUserId: newUserId,
      referralCode: referralCode.toUpperCase(),
      status: 'pending'
    });

    await referral.save();

    res.json({
      success: true,
      message: 'Referral code applied successfully',
      referrer: {
        firstName: referrer.firstName,
        lastName: referrer.lastName,
        username: referrer.username
      }
    });
  } catch (err) {
    console.error('Use referral code error:', err);
    res.status(500).json({ error: 'Failed to apply referral code' });
  }
};

module.exports = {
  generateReferralCode,
  getReferralStats,
  getReferrals,
  useReferralCode
};