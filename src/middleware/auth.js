const jwt = require('jsonwebtoken');
const User = require('../models/User');
const security = require('../utils/security');
const logger = require('../utils/logger');

// Enhanced authentication middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    logger.warn('Authentication attempt without token', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    
    // Get user with security checks
    const user = await User.findById(req.userId);
    if (!user) {
      logger.warn('Authentication with invalid user ID', {
        userId: req.userId,
        ip: req.ip
      });
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Check if account is locked
    if (user.isAccountLocked()) {
      logger.warn('Authentication attempt on locked account', {
        userId: user._id,
        email: security.maskSensitiveData(user.email, 'email'),
        ip: req.ip
      });
      return res.status(423).json({ 
        error: 'Account is temporarily locked',
        lockedUntil: user.accountLockedUntil
      });
    }
    
    // Check account status
    if (user.accountStatus !== 'active') {
      logger.warn('Authentication attempt on inactive account', {
        userId: user._id,
        status: user.accountStatus,
        ip: req.ip
      });
      return res.status(403).json({ 
        error: 'Account is not active',
        status: user.accountStatus
      });
    }
    
    // Update last login info
    user.lastLogin = new Date();
    user.lastLoginIP = req.ip;
    await user.save();
    
    req.user = user;
    next();
  } catch (err) {
    logger.warn('Invalid token used', {
      error: err.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin authentication middleware
const adminAuthMiddleware = async (req, res, next) => {
  await authMiddleware(req, res, () => {
    if (!req.user.isAdmin) {
      logger.warn('Non-admin attempted admin access', {
        userId: req.user._id,
        email: security.maskSensitiveData(req.user.email, 'email'),
        ip: req.ip
      });
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
};

// KYC verification middleware
const kycRequiredMiddleware = (req, res, next) => {
  if (!req.user.kyc.verified) {
    return res.status(403).json({ 
      error: 'KYC verification required',
      kycStatus: req.user.kyc
    });
  }
  next();
};

// Transaction limits middleware
const checkTransactionLimits = async (req, res, next) => {
  const { amount } = req.body;
  const user = req.user;
  
  if (!amount) {
    return next();
  }
  
  // Check single transaction limit
  if (amount > user.transactionLimits.single) {
    return res.status(403).json({
      error: 'Amount exceeds single transaction limit',
      limit: user.transactionLimits.single,
      amount: amount
    });
  }
  
  // Check daily limit (simplified - should check actual daily spending)
  if (amount > user.transactionLimits.daily) {
    return res.status(403).json({
      error: 'Amount exceeds daily transaction limit',
      limit: user.transactionLimits.daily,
      amount: amount
    });
  }
  
  next();
};

// PIN verification middleware for sensitive operations
const pinVerificationMiddleware = async (req, res, next) => {
  const { pin } = req.body;
  const user = req.user;
  
  if (!pin) {
    return res.status(400).json({ error: 'PIN is required for this operation' });
  }
  
  // Check if PIN is locked
  if (user.isPinLocked()) {
    return res.status(423).json({ 
      error: 'PIN is temporarily locked',
      lockedUntil: user.pinLockedUntil
    });
  }
  
  try {
    const isPinValid = await user.comparePin(pin);
    
    if (!isPinValid) {
      user.pinAttempts += 1;
      if (user.pinAttempts >= 5) {
        user.pinLockedUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
      }
      await user.save();
      
      logger.warn('Invalid PIN attempt', {
        userId: user._id,
        attempts: user.pinAttempts,
        ip: req.ip
      });
      
      return res.status(401).json({ 
        error: 'Invalid PIN',
        attemptsRemaining: Math.max(0, 5 - user.pinAttempts)
      });
    }
    
    // Reset PIN attempts on successful verification
    if (user.pinAttempts > 0) {
      user.pinAttempts = 0;
      user.pinLockedUntil = undefined;
      await user.save();
    }
    
    next();
  } catch (error) {
    logger.error('PIN verification error', {
      userId: user._id,
      error: error.message
    });
    res.status(500).json({ error: 'PIN verification failed' });
  }
};

module.exports = {
  authMiddleware,
  adminAuthMiddleware,
  kycRequiredMiddleware,
  checkTransactionLimits,
  pinVerificationMiddleware
};
