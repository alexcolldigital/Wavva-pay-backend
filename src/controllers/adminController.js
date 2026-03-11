const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Merchant = require('../models/Merchant');
const MerchantKYC = require('../models/MerchantKYC');
const UserKYC = require('../models/UserKYC');
const CommissionLedger = require('../models/CommissionLedger');
const logger = require('../utils/logger');
const { getLedgerBalance, getCommissionStats, getLedgerEntries } = require('../services/commissionService');
const { autoVerifyUserKYC, bulkAutoVerifyPending } = require('../services/kycAutoVerification');

// Get platform statistics
const getStats = async (req, res) => {
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
};

// Get all users (paginated)
const getUsers = async (req, res) => {
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
};

// Get transaction analytics
const getTransactionAnalytics = async (req, res) => {
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
};

// Get all transactions (admin view with pagination and filters)
const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, type, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (type) {
      query.type = type;
    }
    
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { transactionId: { $regex: search, $options: 'i' } },
      ];
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    const transactions = await Transaction.find(query)
      .populate('sender', 'firstName lastName email username profilePicture')
      .populate('receiver', 'firstName lastName email username profilePicture')
      .populate('combineId', 'name')
      .sort(sortObj)
      .limit(limitNum)
      .skip(skip);
    
    const total = await Transaction.countDocuments(query);
    
    // Get transaction statistics
    const stats = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        }
      }
    ]);
    
    res.json({
      success: true,
      transactions,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      stats
    });
  } catch (err) {
    logger.error('Transaction fetch failed', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
};

// Suspend user account
const suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        accountStatus: 'suspended',
        suspendedReason: reason,
        suspendedAt: new Date(),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info(`User suspended: ${userId}`, { reason });

    // Broadcast to admin clients
    if (req.io) {
      req.io.to('admin_users').emit('admin:user-status-update', {
        userId,
        status: 'suspended',
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: `User ${user.firstName} ${user.lastName} has been suspended`,
      user,
    });
  } catch (err) {
    logger.error('User suspension failed', err.message);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
};

// Unsuspend user
const unsuspendUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        accountStatus: 'active',
        suspendedReason: undefined,
        suspendedAt: undefined,
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info(`User unsuspended: ${userId}`);

    // Broadcast to admin clients
    if (req.io) {
      req.io.to('admin_users').emit('admin:user-status-update', {
        userId,
        status: 'active',
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: `User ${user.firstName} ${user.lastName} has been unsuspended`,
      user,
    });
  } catch (err) {
    logger.error('User unsuspension failed', err.message);
    res.status(500).json({ error: 'Failed to unsuspend user' });
  }
};

// Refund transaction
const refundTransaction = async (req, res) => {
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
};

// Get fraud alerts
const getFraudAlerts = async (req, res) => {
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
};

// ===== KYC MANAGEMENT FUNCTIONS =====

// Get All Pending KYC Submissions
const getPendingKYC = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const pendingKYCs = await MerchantKYC.find({ status: 'pending' })
      .populate('merchantId', 'businessName businessType phone email kycVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await MerchantKYC.countDocuments({ status: 'pending' });

    res.json({
      success: true,
      pendingKYCs: pendingKYCs.map(kyc => ({
        _id: kyc._id,
        merchantId: kyc.merchantId._id,
        businessName: kyc.merchantId.businessName,
        businessType: kyc.merchantId.businessType,
        phone: kyc.merchantId.phone,
        email: kyc.merchantId.email,
        status: kyc.status,
        kycLevel: kyc.kycLevel,
        businessRegVerified: kyc.businessRegistration?.verified || false,
        directorsCount: kyc.directors?.length || 0,
        bankAccountVerified: kyc.bankAccount?.verified || false,
        submittedAt: kyc.createdAt,
        submissions: kyc.submissions?.length || 0
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    logger.error('Get pending KYC error', err.message);
    res.status(500).json({ error: 'Failed to retrieve pending KYC submissions' });
  }
};

// Get KYC Details (Admin View)
const getKYCDetailsAdmin = async (req, res) => {
  try {
    const { kycId } = req.params;

    const kyc = await MerchantKYC.findById(kycId)
      .populate('merchantId', 'businessName businessType phone email');

    if (!kyc) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    res.json({
      success: true,
      kyc: {
        _id: kyc._id,
        merchant: kyc.merchantId,
        businessRegistration: {
          number: kyc.businessRegistration?.number || null,
          document: kyc.businessRegistration?.document || null,
          verified: kyc.businessRegistration?.verified || false,
          verifiedDate: kyc.businessRegistration?.verifiedDate || null
        },
        directors: kyc.directors || [],
        bankAccount: {
          accountNumber: kyc.bankAccount?.accountNumber || null,
          bankCode: kyc.bankAccount?.bankCode || null,
          bankName: kyc.bankAccount?.bankName || null,
          accountName: kyc.bankAccount?.accountName || null,
          verificationDocument: kyc.bankAccount?.verificationDocument || null,
          verified: kyc.bankAccount?.verified || false,
          verifiedDate: kyc.bankAccount?.verifiedDate || null
        },
        status: kyc.status,
        verified: kyc.verified,
        kycLevel: kyc.kycLevel,
        rejectionReason: kyc.rejectionReason || null,
        submissions: kyc.submissions || [],
        createdAt: kyc.createdAt
      }
    });
  } catch (err) {
    logger.error('Get KYC details admin error', err.message);
    res.status(500).json({ error: 'Failed to retrieve KYC details' });
  }
};

// Approve Merchant KYC
const approveMerchantKYC = async (req, res) => {
  try {
    const { kycId } = req.params;
    const { comment = '' } = req.body;

    const kyc = await MerchantKYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    // Update KYC status
    kyc.status = 'approved';
    kyc.verified = true;
    kyc.verifiedDate = new Date();
    
    kyc.submissions = kyc.submissions || [];
    kyc.submissions.push({
      submittedAt: new Date(),
      status: 'approved',
      comment: comment || 'KYC approved by admin'
    });

    await kyc.save();

    // Update merchant KYC verification
    const merchant = await Merchant.findByIdAndUpdate(
      kyc.merchantId,
      { 
        kycVerified: true,
        kycVerifiedDate: new Date()
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Merchant KYC approved successfully',
      kyc: {
        _id: kyc._id,
        status: kyc.status,
        verified: kyc.verified,
        verifiedDate: kyc.verifiedDate
      },
      merchant: {
        _id: merchant._id,
        businessName: merchant.businessName,
        kycVerified: merchant.kycVerified
      }
    });
  } catch (err) {
    logger.error('Approve KYC error', err.message);
    res.status(500).json({ error: 'Failed to approve KYC' });
  }
};

// Reject Merchant KYC
const rejectMerchantKYC = async (req, res) => {
  try {
    const { kycId } = req.params;
    const { rejectionReason = 'KYC requirements not met' } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const kyc = await MerchantKYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    // Update KYC status
    kyc.status = 'rejected';
    kyc.rejectionReason = rejectionReason;
    kyc.rejectionDate = new Date();
    
    kyc.submissions = kyc.submissions || [];
    kyc.submissions.push({
      submittedAt: new Date(),
      status: 'rejected',
      comment: rejectionReason
    });

    await kyc.save();

    // Update merchant
    const merchant = await Merchant.findByIdAndUpdate(
      kyc.merchantId,
      { kycVerified: false },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Merchant KYC rejected',
      kyc: {
        _id: kyc._id,
        status: kyc.status,
        rejectionReason: kyc.rejectionReason,
        rejectionDate: kyc.rejectionDate
      },
      merchant: {
        _id: merchant._id,
        businessName: merchant.businessName,
        kycVerified: merchant.kycVerified
      }
    });
  } catch (err) {
    logger.error('Reject KYC error', err.message);
    res.status(500).json({ error: 'Failed to reject KYC' });
  }
};

// Verify Specific KYC Document
const verifyKYCDocument = async (req, res) => {
  try {
    const { kycId } = req.params;
    const { documentType, verified = true } = req.body;

    if (!['businessRegistration', 'bankAccount'].includes(documentType) && !documentType.startsWith('director_')) {
      return res.status(400).json({ error: 'Invalid document type' });
    }

    const kyc = await MerchantKYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    // Verify document
    if (documentType === 'businessRegistration') {
      kyc.businessRegistration.verified = verified;
      kyc.businessRegistration.verifiedDate = new Date();
    } else if (documentType === 'bankAccount') {
      kyc.bankAccount.verified = verified;
      kyc.bankAccount.verifiedDate = new Date();
    } else if (documentType.startsWith('director_')) {
      const directorId = documentType.split('_')[1];
      const director = kyc.directors.id(directorId);
      if (director) {
        director.verified = verified;
        director.verifiedDate = new Date();
      }
    }

    await kyc.save();

    res.json({
      success: true,
      message: `Document ${verified ? 'verified' : 'unverified'} successfully`
    });
  } catch (err) {
    logger.error('Verify KYC document error', err.message);
    res.status(500).json({ error: 'Failed to verify document' });
  }
};

// ============================================
// Internal Ledger Management Routes
// ============================================

/**
 * Get internal ledger balance
 * GET /api/admin/ledger/balance
 */
const getLedgerBalance_endpoint = async (req, res) => {
  try {
    const { currency = 'NGN' } = req.query;
    
    // Validate currency
    if (!['NGN', 'USD'].includes(currency)) {
      return res.status(400).json({ error: 'Invalid currency' });
    }
    
    const balance = await getLedgerBalance(currency);
    
    res.json({
      success: true,
      ledger: balance
    });
  } catch (err) {
    logger.error('Get ledger balance error', err.message);
    res.status(500).json({ error: 'Failed to get ledger balance' });
  }
};

/**
 * Get commission statistics
 * GET /api/admin/ledger/stats
 */
const getCommissionStats_endpoint = async (req, res) => {
  try {
    const { startDate, endDate, source, currency } = req.query;
    
    const filters = {};
    if (source) filters.source = source;
    if (currency) filters.currency = currency;
    
    const stats = await getCommissionStats({
      startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate) : new Date(),
      source,
      currency
    });
    
    res.json({
      success: true,
      stats
    });
  } catch (err) {
    logger.error('Get commission stats error', err.message);
    res.status(500).json({ error: 'Failed to get commission statistics' });
  }
};

/**
 * Get commission ledger entries
 * GET /api/admin/ledger/entries
 */
const getLedgerEntries_endpoint = async (req, res) => {
  try {
    const { page = 1, limit = 20, source, currency } = req.query;
    
    const filters = {};
    if (source) filters.source = source;
    if (currency) filters.currency = currency;
    
    const result = await getLedgerEntries(parseInt(page), parseInt(limit), filters);
    
    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    logger.error('Get ledger entries error', err.message);
    res.status(500).json({ error: 'Failed to get ledger entries' });
  }
};

/**
 * Get commission ledger summary for all currencies
 * GET /api/admin/ledger/summary
 */
const getLedgerSummary = async (req, res) => {
  try {
    const balanceNGN = await getLedgerBalance('NGN');
    const balanceUSD = await getLedgerBalance('USD');
    
    // Total collected this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const thisMonth = await CommissionLedger.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth },
          status: 'credited'
        }
      },
      {
        $group: {
          _id: '$currency',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Total all time
    const allTime = await CommissionLedger.aggregate([
      {
        $match: { status: 'credited' }
      },
      {
        $group: {
          _id: '$currency',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      success: true,
      summary: {
        currentBalance: {
          NGN: balanceNGN,
          USD: balanceUSD
        },
        thisMonth: thisMonth.reduce((acc, item) => {
          acc[item._id] = {
            amount: item.total,
            formatted: (item.total / 100).toFixed(2),
            count: item.count
          };
          return acc;
        }, {}),
        allTime: allTime.reduce((acc, item) => {
          acc[item._id] = {
            amount: item.total,
            formatted: (item.total / 100).toFixed(2),
            count: item.count
          };
          return acc;
        }, {})
      }
    });
  } catch (err) {
    logger.error('Get ledger summary error', err.message);
    res.status(500).json({ error: 'Failed to get ledger summary' });
  }
};

/**
 * Get detailed commission breakdown report
 * GET /api/admin/ledger/report
 */
const getCommissionReport = async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    
    // Get all commission sources
    const report = await CommissionLedger.aggregate([
      { $match: { status: 'credited' } },
      {
        $group: {
          _id: {
            source: '$source',
            currency: '$currency'
          },
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' },
          maxAmount: { $max: '$amount' },
          minAmount: { $min: '$amount' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);
    
    const formattedReport = report.map(item => ({
      source: item._id.source,
      currency: item._id.currency,
      totalAmount: item.totalAmount,
      totalFormatted: (item.totalAmount / 100).toFixed(2),
      count: item.count,
      avgAmount: (item.avgAmount / 100).toFixed(2),
      maxAmount: (item.maxAmount / 100).toFixed(2),
      minAmount: (item.minAmount / 100).toFixed(2)
    }));
    
    res.json({
      success: true,
      report: formattedReport,
      generatedAt: new Date()
    });
  } catch (err) {
    logger.error('Get commission report error', err.message);
    res.status(500).json({ error: 'Failed to generate commission report' });
  }
};

// ============================================
// USER KYC MANAGEMENT FUNCTIONS
// ============================================

/**
 * Get All Pending User KYC Submissions
 * GET /api/admin/kyc/user/pending
 */
const getPendingUserKYC = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const pendingKYCs = await UserKYC.find({ status: 'pending' })
      .populate('userId', 'firstName lastName email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await UserKYC.countDocuments({ status: 'pending' });

    res.json({
      success: true,
      kycSubmissions: pendingKYCs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    logger.error('Get pending user KYC error', err.message);
    res.status(500).json({ error: 'Failed to retrieve pending KYC submissions' });
  }
};

/**
 * Get User KYC Details (Admin View)
 * GET /api/admin/kyc/user/:kycId
 */
const getUserKYCDetailsAdmin = async (req, res) => {
  try {
    const { kycId } = req.params;

    const kyc = await UserKYC.findById(kycId)
      .populate('userId', 'firstName lastName email phone');

    if (!kyc) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    res.json({
      success: true,
      kyc: {
        _id: kyc._id,
        user: kyc.userId,
        idType: kyc.idType,
        idNumber: kyc.idNumber,
        idDocumentUrl: kyc.idDocument,
        selfieUrl: kyc.selfieDocument,
        address: kyc.address,
        status: kyc.status,
        verified: kyc.verified,
        kycLevel: kyc.kycLevel,
        rejectionReason: kyc.rejectionReason,
        submissions: kyc.submissions || [],
        flaggedForReview: kyc.flaggedForReview,
        complianceNotes: kyc.complianceNotes,
        createdAt: kyc.createdAt
      }
    });
  } catch (err) {
    logger.error('Get user KYC details admin error', err.message);
    res.status(500).json({ error: 'Failed to retrieve KYC details' });
  }
};

/**
 * Auto-Verify User KYC
 * POST /api/admin/kyc/user/:kycId/auto-verify
 */
const autoVerifyUserKYCEndpoint = async (req, res) => {
  try {
    const { kycId } = req.params;

    const result = await autoVerifyUserKYC(kycId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        kycLevel: result.kycLevel,
        verified: result.verified
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (err) {
    logger.error('Auto-verify user KYC error', err.message);
    res.status(500).json({ error: 'Failed to auto-verify KYC' });
  }
};

/**
 * Approve User KYC
 * POST /api/admin/kyc/user/:kycId/approve
 */
const approveUserKYC = async (req, res) => {
  try {
    const { kycId } = req.params;
    const { comment = '', kycLevel = 2 } = req.body;

    const kyc = await UserKYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    // Update KYC status
    kyc.status = 'approved';
    kyc.verified = true;
    kyc.verifiedDate = new Date();
    kyc.kycLevel = kycLevel;

    // Set expiry (2 years from verification)
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 2);
    kyc.expiryDate = expiryDate;

    kyc.submissions = kyc.submissions || [];
    kyc.submissions.push({
      submittedAt: new Date(),
      status: 'approved',
      comment: comment || 'KYC approved by admin',
      reviewedBy: req.userId
    });

    await kyc.save();

    logger.info(`✅ User KYC approved: ${kyc.userId} (Level ${kycLevel})`);

    res.json({
      success: true,
      message: 'User KYC approved successfully',
      kyc: {
        _id: kyc._id,
        status: kyc.status,
        verified: kyc.verified,
        kycLevel: kyc.kycLevel
      }
    });
  } catch (err) {
    logger.error('Approve user KYC error', err.message);
    res.status(500).json({ error: 'Failed to approve KYC' });
  }
};

/**
 * Reject User KYC
 * POST /api/admin/kyc/user/:kycId/reject
 */
const rejectUserKYC = async (req, res) => {
  try {
    const { kycId } = req.params;
    const { rejectionReason = 'KYC requirements not met' } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const kyc = await UserKYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    // Update KYC status
    kyc.status = 'rejected';
    kyc.verified = false;
    kyc.rejectionDate = new Date();
    kyc.rejectionReason = rejectionReason;

    kyc.submissions = kyc.submissions || [];
    kyc.submissions.push({
      submittedAt: new Date(),
      status: 'rejected',
      comment: rejectionReason,
      reviewedBy: req.userId
    });

    await kyc.save();

    logger.info(`❌ User KYC rejected: ${kyc.userId}`);

    res.json({
      success: true,
      message: 'User KYC rejected successfully',
      kyc: {
        _id: kyc._id,
        status: kyc.status,
        rejectionReason: kyc.rejectionReason
      }
    });
  } catch (err) {
    logger.error('Reject user KYC error', err.message);
    res.status(500).json({ error: 'Failed to reject KYC' });
  }
};

/**
 * Bulk Auto-Verify Pending User KYCs
 * POST /api/admin/kyc/user/bulk-verify
 */
const bulkAutoVerifyUserKYC = async (req, res) => {
  try {
    const { limit = 100 } = req.body;

    const result = await bulkAutoVerifyPending(limit);

    res.json({
      success: true,
      message: `Batch processing completed: ${result.verifiedCount} verified, ${result.failedCount} flagged`,
      ...result
    });
  } catch (err) {
    logger.error('Bulk auto-verify user KYC error', err.message);
    res.status(500).json({ error: 'Failed to bulk verify KYC' });
  }
};

module.exports = {
  getStats,
  getUsers,
  getTransactionAnalytics,
  getTransactions,
  suspendUser,
  unsuspendUser,
  refundTransaction,
  getFraudAlerts,
  getPendingKYC,
  getKYCDetailsAdmin,
  approveMerchantKYC,
  rejectMerchantKYC,
  verifyKYCDocument,
  // User KYC functions
  getPendingUserKYC,
  getUserKYCDetailsAdmin,
  autoVerifyUserKYCEndpoint,
  approveUserKYC,
  rejectUserKYC,
  bulkAutoVerifyUserKYC,
  getLedgerBalance: getLedgerBalance_endpoint,
  getCommissionStats: getCommissionStats_endpoint,
  getLedgerEntries: getLedgerEntries_endpoint,
  getLedgerSummary,
  getCommissionReport,
};
