const express = require('express');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const router = express.Router();

// NOTE: Order matters! Specific routes must come before parameter routes
// This prevents /analytics being matched as /:currency='analytics'

// Get wallet analytics (specific route before /:currency)
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

    // Get primary wallet for backward compatibility
    const wallet = user.walletId;
    const primaryWallet = wallet.getOrCreateWallet('NGN');

    res.json({
      balance: primaryWallet.balance / 100,
      currency: 'NGN',
      analytics: {
        totalSent: sent / 100,
        totalReceived: received / 100,
        transactionCount: transactions.length,
        avgTransaction: avgTransaction / 100,
        thisMonthCount: currentMonth.length,
        topContacts: [],
      },
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get NGN wallet for user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('walletId');
    
    if (!user?.walletId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const wallet = user.walletId;
    
    // Get or create NGN wallet
    const nairaWallet = wallet.getOrCreateWallet('NGN');
    
    // IMPORTANT: Mark wallets array as modified in case new wallets were created
    wallet.markModified('wallets');
    await wallet.save();

    res.json({
      success: true,
      wallets: {
        ngn: {
          currency: 'NGN',
          balance: nairaWallet.balance / 100,
          dailyLimit: nairaWallet.dailyLimit / 100,
          monthlyLimit: nairaWallet.monthlyLimit / 100,
          dailySpent: nairaWallet.dailySpent / 100,
          monthlySpent: nairaWallet.monthlySpent / 100,
        },
      }
    });
  } catch (err) {
    console.error('Error fetching wallets:', err);
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

// Get specific wallet by currency
router.get('/:currency', authMiddleware, async (req, res) => {
  try {
    const { currency } = req.params;
    
    if (!['USD', 'NGN'].includes(currency.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid currency. Supported: USD, NGN' });
    }

    const user = await User.findById(req.userId).populate('walletId');
    
    if (!user?.walletId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const wallet = user.walletId;
    const currencyWallet = wallet.getOrCreateWallet(currency.toUpperCase());
    
    await wallet.save();

    res.json({
      success: true,
      wallet: {
        currency: currencyWallet.currency,
        balance: currencyWallet.balance / 100,
        dailyLimit: currencyWallet.dailyLimit / 100,
        monthlyLimit: currencyWallet.monthlyLimit / 100,
        dailySpent: currencyWallet.dailySpent / 100,
        monthlySpent: currencyWallet.monthlySpent / 100,
      }
    });
  } catch (err) {
    console.error('Error fetching wallet:', err);
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

// Add funds to wallet
router.post('/:currency/add-funds', authMiddleware, async (req, res) => {
  try {
    const { currency } = req.params;
    const { amount } = req.body;

    if (!['USD', 'NGN'].includes(currency.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid currency. Supported: USD, NGN' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const user = await User.findById(req.userId).populate('walletId');
    
    if (!user?.walletId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const wallet = user.walletId;
    const amountInCents = Math.round(amount * 100);
    
    wallet.addFunds(currency.toUpperCase(), amountInCents);
    
    // IMPORTANT: Mark wallets array as modified for Mongoose to detect the change
    wallet.markModified('wallets');
    await wallet.save();

    const currencyWallet = wallet.getWallet(currency.toUpperCase());

    res.json({
      success: true,
      message: `${amount} ${currency.toUpperCase()} added successfully`,
      wallet: {
        currency: currencyWallet.currency,
        balance: currencyWallet.balance / 100,
      }
    });
  } catch (err) {
    console.error('Error adding funds:', err);
    res.status(500).json({ error: err.message || 'Failed to add funds' });
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
