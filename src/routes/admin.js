const express = require('express');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const logger = require('../utils/logger');
const router = express.Router();

// Admin verification middleware
const adminMiddleware = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    
    // Check if user is admin (add isAdmin field to User model)
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (err) {
    res.status(403).json({ error: 'Unauthorized' });
  }
};

// Get platform statistics
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const transactionCount = await Transaction.countDocuments();
    const totalVolume = await Transaction.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const averageTransaction = await Transaction.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, avg: { $avg: '$amount' } } },
    ]);

    // Daily active users
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dau = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          status: 'completed',
        },
      },
      { $group: { _id: null, uniqueUsers: { $addToSet: '$sender' } } },
    ]);

    res.json({
      users: userCount,
      transactions: transactionCount,
      totalVolume: totalVolume[0]?.total || 0,
      averageTransaction: averageTransaction[0]?.avg || 0,
      dailyActiveUsers: dau[0]?.uniqueUsers?.length || 0,
      successRate: await Transaction.countDocuments({ status: 'completed' }) / transactionCount,
    });
  } catch (err) {
    logger.error('Admin stats fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get all users (paginated)
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    
    const query = search 
      ? { $or: [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
        ]}
      : {};

    const users = await User.find(query)
      .select('-passwordHash')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({
      users,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (err) {
    logger.error('Admin user fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get transaction analytics
router.get('/transactions/analytics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const pipeline = [
      { $match: { createdAt: dateFilter } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          total: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' },
        },
      },
    ];

    const analytics = await Transaction.aggregate(pipeline);

    // Daily breakdown
    const dailyPipeline = [
      { $match: { createdAt: dateFilter, status: 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          volume: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const dailyAnalytics = await Transaction.aggregate(dailyPipeline);

    res.json({
      analytics,
      dailyAnalytics,
    });
  } catch (err) {
    logger.error('Analytics fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Suspend user account
router.post('/users/:userId/suspend', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { 
        accountStatus: 'suspended',
        suspendedReason: reason,
        suspendedAt: new Date(),
      },
      { new: true }
    );

    logger.info(`User suspended: ${req.params.userId}`, { reason });

    res.json({
      message: 'User suspended',
      user,
    });
  } catch (err) {
    logger.error('User suspension failed', err.message);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

// Refund transaction
router.post('/transactions/:transactionId/refund', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const transaction = await Transaction.findById(req.params.transactionId);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status === 'refunded') {
      return res.status(400).json({ error: 'Transaction already refunded' });
    }

    // Create refund transaction
    const refund = new Transaction({
      sender: transaction.receiver,
      receiver: transaction.sender,
      amount: transaction.amount,
      currency: transaction.currency,
      type: 'refund',
      description: `Refund: ${reason}`,
      status: 'completed',
    });

    await refund.save();

    // Update original transaction
    transaction.status = 'refunded';
    transaction.refundedAt = new Date();
    await transaction.save();

    // Update wallets
    const senderWallet = await Wallet.findOne({ userId: transaction.sender });
    const receiverWallet = await Wallet.findOne({ userId: transaction.receiver });

    senderWallet.balance += transaction.amount;
    receiverWallet.balance -= transaction.amount;

    await Promise.all([senderWallet.save(), receiverWallet.save()]);

    logger.info(`Transaction refunded: ${req.params.transactionId}`);

    res.json({
      message: 'Transaction refunded',
      refund,
    });
  } catch (err) {
    logger.error('Refund failed', err.message);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

// Get fraud alerts
router.get('/fraud-alerts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Find suspicious transactions (high amount, rapid transfers)
    const alerts = await Transaction.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      },
      { $group: { _id: '$sender', count: { $sum: 1 }, total: { $sum: '$amount' } } },
      { $match: { count: { $gt: 10 }, total: { $gt: 100000 } } },
    ]);

    res.json({
      alerts,
      count: alerts.length,
    });
  } catch (err) {
    logger.error('Fraud alert fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch fraud alerts' });
  }
});

module.exports = router;
