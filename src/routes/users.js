const express = require('express');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const router = express.Router();

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-passwordHash -emailVerificationToken -phoneVerificationOTP')
      .populate('walletId')
      .populate('friends', 'firstName lastName profilePicture email');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, profilePicture, preferredCurrency } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.userId,
      { firstName, lastName, profilePicture, preferredCurrency },
      { new: true }
    ).select('-passwordHash');

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// Add friend
router.post('/friends/add', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.body;

    if (!friendId || friendId === req.userId) {
      return res.status(400).json({ error: 'Invalid friend ID' });
    }

    const user = await User.findById(req.userId);
    const friend = await User.findById(friendId);

    if (!friend) {
      return res.status(404).json({ error: 'Friend not found' });
    }

    if (user.friends.includes(friendId)) {
      return res.status(400).json({ error: 'Already friends' });
    }

    user.friends.push(friendId);
    await user.save();

    res.json({ message: 'Friend added successfully', friends: user.friends });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add friend' });
  }
});

// Get friends list
router.get('/friends', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('friends', 'firstName lastName profilePicture email phone');

    res.json(user.friends);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Search users by email or phone
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query too short' });
    }

    const users = await User.find({
      $or: [
        { email: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
        { firstName: { $regex: query, $options: 'i' } },
      ],
      _id: { $ne: req.userId },
    }).select('firstName lastName profilePicture email phone').limit(10);

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get wallet info
router.get('/wallet', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('walletId');

    if (!user || !user.walletId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({
      balance: user.walletId.balance / 100, // Convert from cents to dollars
      currency: user.walletId.currency,
      dailyLimit: user.walletId.dailyLimit / 100,
      monthlyLimit: user.walletId.monthlyLimit / 100,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

module.exports = router;
