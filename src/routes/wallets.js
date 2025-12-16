const express = require('express');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const router = express.Router();

// Get wallet analytics
router.get('/analytics', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('walletId');
    
    if (!user?.walletId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Get transactions
    const transactions = await Transaction.find({
      $or: [{ sender: req.userId }, { receiver: req.userId }],
      status: 'completed',
    });

    // Calculate stats
    const sent = transactions
      .filter(t => t.sender.equals(req.userId))
      .reduce((sum, t) => sum + t.amount, 0);

    const received = transactions
      .filter(t => t.receiver.equals(req.userId))
      .reduce((sum, t) => sum + t.amount, 0);

    const avgTransaction = transactions.length > 0 
      ? (sent + received) / transactions.length 
      : 0;

    // Monthly breakdown
    const now = new Date();
    const currentMonth = transactions.filter(t => {
      const txDate = new Date(t.createdAt);
      return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
    });

    // Top contacts
    const contacts = {};
    transactions.forEach(t => {
      const contactId = t.sender.equals(req.userId) ? t.receiver : t.sender;
      contacts[contactId] = (contacts[contactId] || 0) + 1;
    });

    const topContacts = Object.entries(contacts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    res.json({
      balance: user.walletId.balance / 100,
      currency: user.walletId.currency,
      analytics: {
        totalSent: sent / 100,
        totalReceived: received / 100,
        transactionCount: transactions.length,
        avgTransaction: avgTransaction / 100,
        thisMonthCount: currentMonth.length,
        topContacts: topContacts.map(([contactId]) => contactId),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Set transaction limits
router.put('/limits', authMiddleware, async (req, res) => {
  try {
    const { dailyLimit, monthlyLimit } = req.body;

    if (dailyLimit && dailyLimit <= 0) {
      return res.status(400).json({ error: 'Invalid daily limit' });
    }

    if (monthlyLimit && monthlyLimit <= 0) {
      return res.status(400).json({ error: 'Invalid monthly limit' });
    }

    const user = await User.findById(req.userId);
    const wallet = await Wallet.findById(user.walletId);

    if (dailyLimit) wallet.dailyLimit = dailyLimit * 100;
    if (monthlyLimit) wallet.monthlyLimit = monthlyLimit * 100;

    await wallet.save();

    res.json({
      message: 'Limits updated',
      dailyLimit: wallet.dailyLimit / 100,
      monthlyLimit: wallet.monthlyLimit / 100,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update limits' });
  }
});

// Check transaction limits
router.post('/check-limits', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.userId);
    const wallet = await Wallet.findById(user.walletId);

    const amountInCents = amount * 100;

    // Check balance
    if (wallet.balance < amountInCents) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        available: wallet.balance / 100,
        needed: amount,
      });
    }

    // Check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyTotal = await Transaction.aggregate([
      {
        $match: {
          sender: req.userId,
          status: 'completed',
          createdAt: { $gte: today },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const dailyUsed = dailyTotal[0]?.total || 0;
    if (dailyUsed + amountInCents > wallet.dailyLimit) {
      return res.status(400).json({
        error: 'Daily limit exceeded',
        used: dailyUsed / 100,
        limit: wallet.dailyLimit / 100,
        remaining: (wallet.dailyLimit - dailyUsed) / 100,
      });
    }

    // Check monthly limit
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthlyTotal = await Transaction.aggregate([
      {
        $match: {
          sender: req.userId,
          status: 'completed',
          createdAt: { $gte: monthStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const monthlyUsed = monthlyTotal[0]?.total || 0;
    if (monthlyUsed + amountInCents > wallet.monthlyLimit) {
      return res.status(400).json({
        error: 'Monthly limit exceeded',
        used: monthlyUsed / 100,
        limit: wallet.monthlyLimit / 100,
        remaining: (wallet.monthlyLimit - monthlyUsed) / 100,
      });
    }

    res.json({
      canProceed: true,
      limits: {
        daily: {
          limit: wallet.dailyLimit / 100,
          used: dailyUsed / 100,
          remaining: (wallet.dailyLimit - dailyUsed) / 100,
        },
        monthly: {
          limit: wallet.monthlyLimit / 100,
          used: monthlyUsed / 100,
          remaining: (wallet.monthlyLimit - monthlyUsed) / 100,
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Limit check failed' });
  }
});

module.exports = router;
