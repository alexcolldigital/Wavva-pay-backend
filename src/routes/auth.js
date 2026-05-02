const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !phone) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email or phone' });
    }

    // Create user first to get the ID
    const user = await User.create({
      email,
      passwordHash: password,
      firstName,
      lastName,
      phone,
      kycTier: 1,
      dailyTransactionLimit: 10000000,
      monthlyTransactionLimit: 50000000
    });

    // Create wallet linked to user
    const wallet = await Wallet.create({
      userId: user._id,
      balance: 0,
      currency: 'NGN',
      wallets: [
        { currency: 'NGN', balance: 0, dailyLimit: 10000000, monthlyLimit: 20000000 }
      ]
    });

    // Link wallet to user
    user.walletId = wallet._id;
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        kycTier: user.kycTier
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email }).populate('walletId');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        kycTier: user.kycTier,
        wallet: {
          balance: user.walletId.getWallet('NGN').balance / 100,
          currency: 'NGN'
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-passwordHash')
      .populate('walletId');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        kycTier: user.kycTier,
        wallet: {
          balance: user.walletId.getWallet('NGN').balance / 100,
          currency: 'NGN'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// KYC upgrade
router.post('/kyc-upgrade', authMiddleware, async (req, res) => {
  try {
    const { bvn, nin, targetTier } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate tier upgrade
    if (targetTier <= user.kycTier) {
      return res.status(400).json({ error: 'Target tier must be higher than current tier' });
    }

    // Update user KYC info
    if (bvn) user.bvn = bvn;
    if (nin) user.nin = nin;
    user.kycTier = targetTier;

    // Update transaction limits based on tier
    if (targetTier === 2) {
      user.dailyTransactionLimit = 50000000; // ₦500,000
      user.monthlyTransactionLimit = 200000000; // ₦2,000,000
    } else if (targetTier === 3) {
      user.dailyTransactionLimit = 200000000; // ₦2,000,000
      user.monthlyTransactionLimit = 1000000000; // ₦10,000,000
    }

    await user.save();

    res.json({
      success: true,
      message: 'KYC tier upgraded successfully',
      kycTier: user.kycTier,
      dailyLimit: user.dailyTransactionLimit / 100,
      monthlyLimit: user.monthlyTransactionLimit / 100
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;