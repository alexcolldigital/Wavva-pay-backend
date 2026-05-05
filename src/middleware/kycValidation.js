const UserKYC = require('../models/UserKYC');
const logger = require('../utils/logger');

/**
 * Validate user KYC status for transaction
 * Checks transaction amount against KYC level limits
 */
const validateKYCForTransaction = async (req, res, next) => {
  try {
    const userId = req.userId;
    const amount = req.body.amount || 0; // Amount in base units (Naira)

    // Get user KYC
    let userKYC = await UserKYC.findOne({ userId });

    // Default limits (KYC Level 0)
    const limits = userKYC?.limits || {
      dailyLimit: 500000, // ₦5,000
      monthlyLimit: 5000000, // ₦50,000
      singleTransactionLimit: 1000000 // ₦10,000
    };

    const amountInCents = Math.round(amount * 100);

    // Check single transaction limit
    if (amountInCents > limits.singleTransactionLimit) {
      return res.status(403).json({
        success: false,
        error: 'Amount exceeds maximum transaction limit',
        limit: limits.singleTransactionLimit / 100,
        kycLevel: userKYC?.kycLevel || 0,
        message: `Maximum transaction limit is ₦${limits.singleTransactionLimit / 100}. Complete KYC to increase limits.`
      });
    }

    // Check if KYC requires reverification
    if (userKYC?.requiresReverification) {
      return res.status(403).json({
        success: false,
        error: 'KYC verification expired',
        message: 'Please complete KYC verification again'
      });
    }

    // Attach KYC info to request
    req.userKYC = userKYC;
    req.kycLimits = limits;

    next();
  } catch (err) {
    logger.error('KYC validation error:', err.message);
    // Continue without KYC validation on error (fail-open)
    next();
  }
};

/**
 * Require verified KYC for high-value transactions
 * Blocks transactions if user KYC is not verified
 */
const requireVerifiedKYC = async (req, res, next) => {
  try {
    const userId = req.userId;
    const userKYC = await UserKYC.findOne({ userId });

    // Block if not verified or expired
    if (!userKYC?.verified || userKYC?.status !== 'approved') {
      return res.status(403).json({
        success: false,
        error: 'KYC verification required',
        kycStatus: userKYC?.status || 'pending',
        message: 'Please complete KYC verification to perform this action'
      });
    }

    if (userKYC.requiresReverification) {
      return res.status(403).json({
        success: false,
        error: 'KYC verification expired',
        message: 'Please complete KYC verification again'
      });
    }

    req.userKYC = userKYC;
    next();
  } catch (err) {
    logger.error('KYC requirement validation error:', err.message);
    res.status(500).json({ error: 'Failed to validate KYC status' });
  }
};

/**
 * Check daily transaction limit
 * Prevents users from exceeding daily spending limits
 */
const checkDailyLimit = async (req, res, next) => {
  try {
    const userId = req.userId;
    const amount = req.body.amount || 0;

    const userKYC = await UserKYC.findOne({ userId });
    const dailyLimit = userKYC?.limits?.dailyLimit || 500000;

    // Get today's completed transactions
    const Transaction = require('../models/Transaction');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySpent = await Transaction.aggregate([
      {
        $match: {
          sender: userId,
          status: 'completed',
          createdAt: { $gte: today }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const spent = todaySpent[0]?.total || 0;
    const amountInCents = Math.round(amount * 100);
    const remaining = dailyLimit - spent;

    if (amountInCents > remaining) {
      return res.status(403).json({
        success: false,
        error: 'Daily limit exceeded',
        dailyLimit: dailyLimit / 100,
        spent: spent / 100,
        remaining: remaining / 100,
        requested: amount,
        message: `Daily limit exceeded. You can spend ₦${remaining / 100} more today.`
      });
    }

    req.kycDailyRemaining = remaining;
    next();
  } catch (err) {
    logger.error('Daily limit check error:', err.message);
    // Continue without validation on error
    next();
  }
};

/**
 * Check monthly transaction limit
 */
const checkMonthlyLimit = async (req, res, next) => {
  try {
    const userId = req.userId;
    const amount = req.body.amount || 0;

    const userKYC = await UserKYC.findOne({ userId });
    const monthlyLimit = userKYC?.limits?.monthlyLimit || 5000000;

    // Get this month's completed transactions
    const Transaction = require('../models/Transaction');
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthSpent = await Transaction.aggregate([
      {
        $match: {
          sender: userId,
          status: 'completed',
          createdAt: { $gte: startOfMonth }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const spent = monthSpent[0]?.total || 0;
    const amountInCents = Math.round(amount * 100);
    const remaining = monthlyLimit - spent;

    if (amountInCents > remaining) {
      return res.status(403).json({
        success: false,
        error: 'Monthly limit exceeded',
        monthlyLimit: monthlyLimit / 100,
        spent: spent / 100,
        remaining: remaining / 100,
        requested: amount,
        message: `Monthly limit exceeded. You can spend ₦${remaining / 100} more this month.`
      });
    }

    req.kycMonthlyRemaining = remaining;
    next();
  } catch (err) {
    logger.error('Monthly limit check error:', err.message);
    // Continue without validation on error
    next();
  }
};

module.exports = {
  validateKYCForTransaction,
  requireVerifiedKYC,
  checkDailyLimit,
  checkMonthlyLimit
};
