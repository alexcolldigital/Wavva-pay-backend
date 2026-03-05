/**
 * Commission Service
 * Handles recording and managing commission collections to internal ledger
 */

const CommissionLedger = require('../models/CommissionLedger');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const logger = require('../utils/logger');

const INTERNAL_LEDGER_USER_EMAIL = 'system.ledger@wavvapay.internal';

/**
 * Get or create the internal ledger admin user
 */
async function getInternalLedgerUser() {
  try {
    let user = await User.findOne({ email: INTERNAL_LEDGER_USER_EMAIL });
    
    if (!user) {
      // Create internal ledger user if it doesn't exist
      user = new User({
        firstName: 'Wavva',
        lastName: 'Internal',
        email: INTERNAL_LEDGER_USER_EMAIL,
        phone: 'system',
        username: 'wavva-ledger-system',
        password: 'system-ledger-' + Math.random().toString(36).substring(7), // Random password
        isAdmin: true,
        isSystemAccount: true, // Mark as system account
        accountStatus: 'verified',
        kycStatus: 'verified',
      });
      
      await user.save();
      
      // Create wallet for internal ledger
      const wallet = new Wallet({
        userId: user._id,
        balance: 0,
        currency: 'NGN',
        wallets: [
          {
            currency: 'NGN',
            purpose: 'commission',
            name: 'Platform Commission Ledger',
            balance: 0,
            isActive: true
          },
          {
            currency: 'USD',
            purpose: 'commission',
            name: 'Platform Commission Ledger (USD)',
            balance: 0,
            isActive: true
          }
        ]
      });
      
      await wallet.save();
      user.walletId = wallet._id;
      await user.save();
      
      logger.info('✅ Created internal ledger system user');
    }
    
    return user;
  } catch (err) {
    logger.error('Failed to get internal ledger user', err.message);
    throw err;
  }
}

/**
 * Record a commission/fee to the internal ledger
 * @param {Object} commissionData - Commission details
 * @param {string} commissionData.transactionId - Transaction that generated the fee
 * @param {number} commissionData.amount - Commission amount in cents
 * @param {string} commissionData.currency - Currency code
 * @param {string} commissionData.source - Source of commission (p2p_transfer, wallet_funding, etc.)
 * @param {string} commissionData.fromUser - User who paid the fee
 * @param {string} commissionData.toUser - Recipient user (if applicable)
 * @param {string} commissionData.merchantId - Merchant (if applicable)
 * @param {number} commissionData.feePercentage - Fee percentage charged
 * @param {number} commissionData.grossAmount - Original transaction amount
 * @param {string} commissionData.description - Description of the commission
 * @returns {Object} - Created commission ledger entry
 */
async function recordCommission(commissionData) {
  try {
    // Validate required fields
    if (!commissionData.amount || commissionData.amount <= 0) {
      throw new Error('Invalid commission amount');
    }
    
    if (!commissionData.source) {
      throw new Error('Commission source is required');
    }
    
    // Get internal ledger user
    const ledgerUser = await getInternalLedgerUser();
    
    // Generate ledger entry number
    const date = new Date();
    const dateString = date.getFullYear() + 
                       String(date.getMonth() + 1).padStart(2, '0') + 
                       String(date.getDate()).padStart(2, '0');
    
    const randomSuffix = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    const ledgerEntryNumber = `COM-${dateString}-${randomSuffix}`;
    
    // Create commission ledger entry
    const commission = new CommissionLedger({
      transactionId: commissionData.transactionId,
      merchantTransactionId: commissionData.merchantTransactionId,
      amount: commissionData.amount,
      currency: commissionData.currency || 'NGN',
      source: commissionData.source,
      fromUser: commissionData.fromUser,
      toUser: commissionData.toUser,
      merchantId: commissionData.merchantId,
      description: commissionData.description || `Commission from ${commissionData.source}`,
      feePercentage: commissionData.feePercentage,
      grossAmount: commissionData.grossAmount,
      status: 'credited',
      ledgerEntryNumber,
      notes: commissionData.notes
    });
    
    await commission.save();
    
    // Update internal ledger wallet
    const ledgerWallet = await Wallet.findById(ledgerUser.walletId);
    if (ledgerWallet) {
      // Get or create commission wallet for currency
      const commissionWallet = ledgerWallet.getOrCreateWallet(
        commissionData.currency || 'NGN',
        'commission',
        `Commission Ledger (${commissionData.currency || 'NGN'})`
      );
      
      const previousBalance = commissionWallet.balance;
      commissionWallet.balance += commissionData.amount;
      ledgerWallet.markModified('wallets');
      await ledgerWallet.save();
      
      logger.info(`📊 Commission Recorded: ${ledgerEntryNumber}`, {
        amount: (commissionData.amount / 100).toFixed(2),
        currency: commissionData.currency || 'NGN',
        source: commissionData.source,
        previousBalance: (previousBalance / 100).toFixed(2),
        newBalance: (commissionWallet.balance / 100).toFixed(2)
      });
    }
    
    return commission;
  } catch (err) {
    logger.error('Failed to record commission', err.message);
    throw err;
  }
}

/**
 * Reverse a commission (e.g., for refunded transactions)
 * @param {string} commissionId - Commission ledger ID to reverse
 * @param {string} reason - Reason for reversal
 */
async function reverseCommission(commissionId, reason = 'Refund') {
  try {
    const commission = await CommissionLedger.findById(commissionId);
    if (!commission) {
      throw new Error('Commission ledger entry not found');
    }
    
    if (commission.status === 'reversed') {
      throw new Error('Commission already reversed');
    }
    
    // Get internal ledger user
    const ledgerUser = await getInternalLedgerUser();
    
    // Update ledger wallet
    const ledgerWallet = await Wallet.findById(ledgerUser.walletId);
    if (ledgerWallet) {
      const commissionWallet = ledgerWallet.getWalletByPurpose(commission.currency, 'commission');
      if (commissionWallet) {
        const previousBalance = commissionWallet.balance;
        commissionWallet.balance -= commission.amount;
        ledgerWallet.markModified('wallets');
        await ledgerWallet.save();
        
        logger.info('🔄 Commission Reversed', {
          ledgerEntry: commission.ledgerEntryNumber,
          amount: (commission.amount / 100).toFixed(2),
          reason,
          previousBalance: (previousBalance / 100).toFixed(2),
          newBalance: (commissionWallet.balance / 100).toFixed(2)
        });
      }
    }
    
    // Mark as reversed
    commission.status = 'reversed';
    commission.notes = (commission.notes || '') + ` | Reversed: ${reason}`;
    await commission.save();
    
    return commission;
  } catch (err) {
    logger.error('Failed to reverse commission', err.message);
    throw err;
  }
}

/**
 * Get internal ledger balance
 * @param {string} currency - Currency to get balance for
 */
async function getLedgerBalance(currency = 'NGN') {
  try {
    const ledgerUser = await getInternalLedgerUser();
    const wallet = await Wallet.findById(ledgerUser.walletId);
    
    if (!wallet) {
      return { balance: 0, currency };
    }
    
    const commissionWallet = wallet.getWalletByPurpose(currency, 'commission');
    return {
      balance: commissionWallet ? commissionWallet.balance : 0,
      currency,
      formatted: commissionWallet ? (commissionWallet.balance / 100).toFixed(2) : '0.00'
    };
  } catch (err) {
    logger.error('Failed to get ledger balance', err.message);
    throw err;
  }
}

/**
 * Get commission statistics
 * @param {Object} filters - Filters (startDate, endDate, source, currency)
 */
async function getCommissionStats(filters = {}) {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      endDate = new Date(),
      source,
      currency
    } = filters;
    
    const matchStage = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'credited'
    };
    
    if (source) matchStage.source = source;
    if (currency) matchStage.currency = currency;
    
    const stats = await CommissionLedger.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalCount: { $sum: 1 },
          avgAmount: { $avg: '$amount' },
          minAmount: { $min: '$amount' },
          maxAmount: { $max: '$amount' }
        }
      }
    ]);
    
    // Get breakdown by source
    const bySource = await CommissionLedger.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$source',
          amount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { amount: -1 } }
    ]);
    
    const result = stats.length > 0 ? stats[0] : { 
      totalAmount: 0, 
      totalCount: 0, 
      avgAmount: 0,
      minAmount: 0,
      maxAmount: 0
    };
    
    return {
      period: { startDate, endDate },
      total: {
        amount: result.totalAmount,
        formatted: (result.totalAmount / 100).toFixed(2),
        count: result.totalCount,
        average: (result.avgAmount / 100).toFixed(2),
        min: (result.minAmount / 100).toFixed(2),
        max: (result.maxAmount / 100).toFixed(2)
      },
      bySource: bySource.map(item => ({
        source: item._id,
        amount: item.amount,
        formatted: (item.amount / 100).toFixed(2),
        count: item.count
      }))
    };
  } catch (err) {
    logger.error('Failed to get commission stats', err.message);
    throw err;
  }
}

/**
 * Get commission ledger entries with pagination
 */
async function getLedgerEntries(page = 1, limit = 20, filters = {}) {
  try {
    const query = { status: { $ne: 'reversed' }, ...filters };
    
    const entries = await CommissionLedger.find(query)
      .populate('fromUser', 'firstName lastName username email')
      .populate('toUser', 'firstName lastName username email')
      .populate('merchantId', 'businessName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    
    const total = await CommissionLedger.countDocuments(query);
    
    return {
      entries: entries.map(entry => ({
        _id: entry._id,
        ledgerEntry: entry.ledgerEntryNumber,
        amount: (entry.amount / 100).toFixed(2),
        currency: entry.currency,
        source: entry.source,
        fromUser: entry.fromUser ? `${entry.fromUser.firstName} ${entry.fromUser.lastName}` : 'System',
        date: entry.createdAt,
        description: entry.description
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (err) {
    logger.error('Failed to get ledger entries', err.message);
    throw err;
  }
}

module.exports = {
  recordCommission,
  reverseCommission,
  getLedgerBalance,
  getCommissionStats,
  getLedgerEntries,
  getInternalLedgerUser
};
