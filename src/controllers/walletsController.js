const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

// Get wallet analytics
const getAnalytics = async (req, res) => {
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
};

// Get NGN wallet for user
const getWallets = async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('walletId');
    
    if (!user?.walletId) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }

    const wallet = user.walletId;
    
    // Get or create NGN wallet
    const nairaWallet = wallet.getOrCreateWallet('NGN');
    
    // IMPORTANT: Mark wallets array as modified in case new wallets were created
    wallet.markModified('wallets');
    await wallet.save();

    // Return wallets as array for mobile app compatibility
    const walletsArray = wallet.wallets.map((w) => ({
      id: w._id?.toString() || w._id,
      name: w.name || `${w.currency} ${w.purpose || 'Wallet'}`,
      currency: w.currency,
      balance: w.balance / 100,
      dailyLimit: w.dailyLimit / 100,
      monthlyLimit: w.monthlyLimit / 100,
      dailySpent: w.dailySpent / 100,
      monthlySpent: w.monthlySpent / 100,
      purpose: w.purpose || 'general',
      isActive: w.isActive,
      isDefault: w.purpose === 'general' && w.currency === 'NGN',
      createdAt: w.createdAt,
    }));

    res.json({
      success: true,
      data: walletsArray
    });
  } catch (err) {
    console.error('Error fetching wallets:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch wallet' });
  }
};

// Get specific wallet by currency
const getWalletByCurrency = async (req, res) => {
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
};

// Add funds to wallet
const addFunds = async (req, res) => {
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
};

// Set transaction limits
const setLimits = async (req, res) => {
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
};

// Check transaction limits
const checkLimits = async (req, res) => {
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
};

// Create a new wallet with specific purpose
const createPurposeWallet = async (req, res) => {
  try {
    const { currency = 'NGN', purpose = 'general', name } = req.body;
    const user = await User.findById(req.userId).populate('walletId');

    if (!user?.walletId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Validate purpose
    const validPurposes = ['general', 'savings', 'bills', 'spending', 'investment', 'emergency'];
    if (!validPurposes.includes(purpose)) {
      return res.status(400).json({ 
        error: `Invalid purpose. Must be one of: ${validPurposes.join(', ')}` 
      });
    }

    // Validate currency
    const validCurrencies = ['USD', 'NGN'];
    if (!validCurrencies.includes(currency)) {
      return res.status(400).json({ 
        error: 'Invalid currency. Only USD and NGN are supported.' 
      });
    }

    // Create the wallet (allow multiple wallets with same purpose but different names)
    const wallet = user.walletId.getOrCreateWallet(currency, purpose, name);
    user.walletId.markModified('wallets');
    await user.walletId.save();

    res.json({
      success: true,
      message: 'Wallet created successfully',
      wallet: {
        _id: wallet._id,
        currency: wallet.currency,
        purpose: wallet.purpose,
        name: wallet.name,
        balance: wallet.balance / 100,
        dailyLimit: wallet.dailyLimit / 100,
        monthlyLimit: wallet.monthlyLimit / 100,
        isActive: wallet.isActive,
        createdAt: wallet.createdAt,
      }
    });
  } catch (err) {
    console.error('Create wallet error:', err);
    res.status(500).json({ error: 'Failed to create wallet' });
  }
};

// Get all wallets by purpose
const getWalletsByPurpose = async (req, res) => {
  try {
    const { purpose } = req.params;
    const user = await User.findById(req.userId).populate('walletId');

    if (!user?.walletId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Validate purpose
    const validPurposes = ['general', 'savings', 'bills', 'spending', 'investment', 'emergency'];
    if (!validPurposes.includes(purpose)) {
      return res.status(400).json({ 
        error: `Invalid purpose. Must be one of: ${validPurposes.join(', ')}` 
      });
    }

    const wallets = user.walletId.getWalletsByPurpose(purpose);

    res.json({
      success: true,
      purpose,
      wallets: wallets.map(w => ({
        _id: w._id,
        currency: w.currency,
        purpose: w.purpose,
        name: w.name,
        balance: w.balance / 100,
        dailyLimit: w.dailyLimit / 100,
        monthlyLimit: w.monthlyLimit / 100,
        dailySpent: w.dailySpent / 100,
        monthlySpent: w.monthlySpent / 100,
        isActive: w.isActive,
        createdAt: w.createdAt,
      })),
      totalBalance: wallets.reduce((sum, w) => sum + w.balance, 0) / 100,
    });
  } catch (err) {
    console.error('Get wallets by purpose error:', err);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
};

// Get all active wallets for a user (organized by purpose)
const getAllWallets = async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('walletId');

    if (!user?.walletId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const wallet = user.walletId;
    const purposes = ['general', 'savings', 'bills', 'spending', 'investment', 'emergency'];
    const organizedWallets = {};

    purposes.forEach(purpose => {
      organizedWallets[purpose] = wallet.getWalletsByPurpose(purpose).map(w => ({
        _id: w._id,
        currency: w.currency,
        purpose: w.purpose,
        name: w.name,
        balance: w.balance / 100,
        dailyLimit: w.dailyLimit / 100,
        monthlyLimit: w.monthlyLimit / 100,
        dailySpent: w.dailySpent / 100,
        monthlySpent: w.monthlySpent / 100,
        isActive: w.isActive,
        createdAt: w.createdAt,
      }));
    });

    const totalBalance = wallet.wallets.reduce((sum, w) => sum + w.balance, 0);

    res.json({
      success: true,
      wallets: organizedWallets,
      summary: {
        totalBalance: totalBalance / 100,
        totalWallets: wallet.wallets.filter(w => w.isActive).length,
        currencies: ['USD', 'NGN'],
      }
    });
  } catch (err) {
    console.error('Get all wallets error:', err);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
};

module.exports = {
  getAnalytics,
  getWallets,
  getWalletByCurrency,
  createPurposeWallet,
  getWalletsByPurpose,
  getAllWallets,
  addFunds,
  setLimits,
  checkLimits,
};
