const WalletV2 = require('../models/WalletV2');
const Ledger = require('../models/Ledger');
const CommissionRule = require('../models/CommissionRule');
const TransactionService = require('../transactions/transactionService');
const WalletService = require('../wallet/walletService');
const CommissionService = require('../commission/commissionService');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

class AdminService {
  // Dashboard statistics
  static async getDashboardStats() {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // User stats
      const totalUsers = await User.countDocuments();
      const activeUsersToday = await User.countDocuments({
        lastLogin: { $gte: startOfDay }
      });

      // Transaction stats
      const totalTransactions = await Transaction.countDocuments();
      const transactionsToday = await Transaction.countDocuments({
        createdAt: { $gte: startOfDay }
      });

      const transactionVolume = await Transaction.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const transactionVolumeToday = await Transaction.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: startOfDay }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      // Success rate
      const successfulTransactions = await Transaction.countDocuments({
        status: 'completed'
      });
      const successRate = totalTransactions > 0 ?
        (successfulTransactions / totalTransactions * 100).toFixed(2) : 0;

      // Commission stats
      const commissionThisMonth = await Ledger.aggregate([
        {
          $match: {
            type: 'fee_collection',
            status: 'completed',
            createdAt: { $gte: startOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: '$commission' } } }
      ]);

      return {
        users: {
          total: totalUsers,
          activeToday: activeUsersToday,
          growth: 0 // Calculate based on previous period
        },
        transactions: {
          total: totalTransactions,
          today: transactionsToday,
          volume: transactionVolume[0]?.total || 0,
          volumeToday: transactionVolumeToday[0]?.total || 0,
          successRate: parseFloat(successRate)
        },
        revenue: {
          commissionThisMonth: commissionThisMonth[0]?.total || 0,
          totalCommission: 0 // Calculate total
        }
      };

    } catch (error) {
      throw new Error(`Failed to get dashboard stats: ${error.message}`);
    }
  }

  // User management
  static async getUsers(filters = {}, pagination = {}) {
    try {
      const query = {};

      if (filters.email) query.email = new RegExp(filters.email, 'i');
      if (filters.status) query.status = filters.status;
      if (filters.kycStatus) query.kycStatus = filters.kycStatus;

      const page = pagination.page || 1;
      const limit = pagination.limit || 20;
      const skip = (page - 1) * limit;

      const users = await User.find(query)
        .select('firstName lastName email phone status kycStatus createdAt lastLogin')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await User.countDocuments(query);

      // Get wallet balances for each user
      for (const user of users) {
        const wallet = await WalletService.getUserWallet(user._id);
        user.walletBalance = wallet ? wallet.balance : 0;
      }

      return {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      throw new Error(`Failed to get users: ${error.message}`);
    }
  }

  static async suspendUser(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.status = 'suspended';
      await user.save();

      // Freeze user wallet
      const wallet = await WalletService.getUserWallet(userId);
      if (wallet) {
        await WalletService.freezeWallet(wallet.walletId);
      }

      return user;
    } catch (error) {
      throw new Error(`Failed to suspend user: ${error.message}`);
    }
  }

  static async unsuspendUser(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.status = 'active';
      await user.save();

      // Unfreeze user wallet
      const wallet = await WalletService.getUserWallet(userId);
      if (wallet) {
        await WalletService.unfreezeWallet(wallet.walletId);
      }

      return user;
    } catch (error) {
      throw new Error(`Failed to unsuspend user: ${error.message}`);
    }
  }

  // Transaction management
  static async getTransactions(filters = {}, pagination = {}) {
    try {
      const query = {};

      if (filters.status) query.status = filters.status;
      if (filters.type) query.type = filters.type;
      if (filters.userId) query.$or = [{ sender: filters.userId }, { receiver: filters.userId }];
      if (filters.dateRange) {
        query.createdAt = {
          $gte: new Date(filters.dateRange.start),
          $lte: new Date(filters.dateRange.end)
        };
      }

      const page = pagination.page || 1;
      const limit = pagination.limit || 20;
      const skip = (page - 1) * limit;

      const transactions = await Transaction.find(query)
        .populate('sender', 'firstName lastName email')
        .populate('receiver', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Transaction.countDocuments(query);

      return {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      throw new Error(`Failed to get transactions: ${error.message}`);
    }
  }

  static async refundTransaction(transactionId, reason) {
    try {
      const result = await TransactionService.reverseTransaction(transactionId, reason, 'admin');
      return result;
    } catch (error) {
      throw new Error(`Failed to refund transaction: ${error.message}`);
    }
  }

  // Wallet management
  static async getWallets(filters = {}, pagination = {}) {
    try {
      const query = {};

      if (filters.type) query.type = filters.type;
      if (filters.status) query.status = filters.status;
      if (filters.currency) query.currency = filters.currency;

      const page = pagination.page || 1;
      const limit = pagination.limit || 20;
      const skip = (page - 1) * limit;

      const wallets = await WalletV2.find(query)
        .populate('userId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await WalletV2.countDocuments(query);

      return {
        wallets,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      throw new Error(`Failed to get wallets: ${error.message}`);
    }
  }

  static async freezeWallet(walletId) {
    try {
      return await WalletService.freezeWallet(walletId);
    } catch (error) {
      throw new Error(`Failed to freeze wallet: ${error.message}`);
    }
  }

  static async unfreezeWallet(walletId) {
    try {
      return await WalletService.unfreezeWallet(walletId);
    } catch (error) {
      throw new Error(`Failed to unfreeze wallet: ${error.message}`);
    }
  }

  static async moveFunds(fromWalletId, toWalletId, amount, reason) {
    try {
      const result = await WalletService.transfer(fromWalletId, toWalletId, amount, {
        type: 'admin_transfer',
        description: `Admin fund movement: ${reason}`,
        metadata: { reason, movedBy: 'admin' }
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to move funds: ${error.message}`);
    }
  }

  // Commission management
  static async getCommissionRules() {
    try {
      return await CommissionService.getCommissionRules();
    } catch (error) {
      throw new Error(`Failed to get commission rules: ${error.message}`);
    }
  }

  static async updateCommissionRule(ruleId, updates) {
    try {
      return await CommissionService.updateCommissionRule(ruleId, updates);
    } catch (error) {
      throw new Error(`Failed to update commission rule: ${error.message}`);
    }
  }

  static async getCommissionStats(currency = 'NGN', dateRange = {}) {
    try {
      return await CommissionService.getCommissionStats(currency, dateRange);
    } catch (error) {
      throw new Error(`Failed to get commission stats: ${error.message}`);
    }
  }

  // System settings
  static async getSystemSettings() {
    try {
      // In a real implementation, this would fetch from a settings collection
      // For now, return default settings
      return {
        commissionRates: await CommissionService.getCommissionRules(),
        transactionLimits: {
          dailyTransferLimit: 10000000, // 100k NGN
          monthlyTransferLimit: 100000000, // 1M NGN
          maxTransactionAmount: 10000000 // 100k NGN
        },
        systemStatus: 'active',
        maintenanceMode: false
      };
    } catch (error) {
      throw new Error(`Failed to get system settings: ${error.message}`);
    }
  }

  static async updateSystemSettings(settings) {
    try {
      // In a real implementation, this would update a settings collection
      // For now, just return success
      return { success: true, message: 'Settings updated' };
    } catch (error) {
      throw new Error(`Failed to update system settings: ${error.message}`);
    }
  }

  // Fraud detection
  static async getFraudAlerts() {
    try {
      // Get suspicious transactions (high amounts, rapid transfers, etc.)
      const highValueTransactions = await Transaction.find({
        amount: { $gte: 5000000 }, // 50k NGN
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      }).limit(10);

      const rapidTransfers = await Transaction.aggregate([
        {
          $match: {
            type: 'transfer',
            createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
          }
        },
        {
          $group: {
            _id: '$sender',
            count: { $sum: 1 }
          }
        },
        {
          $match: { count: { $gte: 10 } } // 10+ transfers in an hour
        }
      ]);

      return {
        highValueTransactions,
        rapidTransfers: rapidTransfers.length,
        flaggedUsers: [] // Implement user flagging logic
      };
    } catch (error) {
      throw new Error(`Failed to get fraud alerts: ${error.message}`);
    }
  }

  // Audit logs
  static async getAuditLogs(filters = {}, pagination = {}) {
    try {
      // Get ledger entries as audit logs
      const query = {};

      if (filters.userId) query.userId = filters.userId;
      if (filters.type) query.type = filters.type;
      if (filters.dateRange) {
        query.createdAt = {
          $gte: new Date(filters.dateRange.start),
          $lte: new Date(filters.dateRange.end)
        };
      }

      const page = pagination.page || 1;
      const limit = pagination.limit || 50;
      const skip = (page - 1) * limit;

      const logs = await Ledger.find(query)
        .populate('userId', 'firstName lastName email')
        .populate('fromWallet', 'type name')
        .populate('toWallet', 'type name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Ledger.countDocuments(query);

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }
  }
}

module.exports = AdminService;