const CommissionRule = require('../../models/CommissionRule');
const WalletService = require('../wallet/walletService');
const Ledger = require('../../models/Ledger');

class CommissionService {
  // Initialize default commission rules
  static async initializeDefaultRules() {
    const defaultRules = [
      // Transfer rules
      {
        ruleId: 'TRANSFER_DEFAULT',
        name: 'Default Transfer Fees',
        description: 'Standard transfer fees with free daily transfers',
        transactionType: 'transfer',
        currency: 'NGN',
        feeType: 'fixed',
        fixedFee: 1000, // 10 NGN in kobo
        conditions: {
          freeDailyTransfers: 2,
          govtFeeThreshold: 1000000, // 10,000 NGN
          govtFee: 5000 // 50 NGN
        },
        priority: 10
      },

      // Funding rules
      {
        ruleId: 'FUNDING_DEFAULT',
        name: 'Default Funding Fees',
        description: 'Tiered funding fees',
        transactionType: 'funding',
        currency: 'NGN',
        feeType: 'tiered',
        tiers: [
          { minAmount: 0, maxAmount: 50000, fee: 1000, feeType: 'fixed' }, // < 500 NGN: 10 NGN
          { minAmount: 50000, maxAmount: 5000000, fee: 2000, feeType: 'fixed' }, // 500-50k NGN: 20 NGN
          { minAmount: 5000000, fee: 1, feeType: 'percentage' } // > 50k NGN: 1% capped at 200 NGN
        ],
        conditions: {
          percentageCap: 20000 // 200 NGN cap
        },
        priority: 10
      },

      // Bill payment rules
      {
        ruleId: 'BILLS_DEFAULT',
        name: 'Default Bill Payment Fees',
        description: 'Percentage-based bill payment fees',
        transactionType: 'bill_payment',
        currency: 'NGN',
        feeType: 'percentage',
        percentageFee: 2.0, // 2%
        priority: 10
      },

      // Airtime rules
      {
        ruleId: 'AIRTIME_DEFAULT',
        name: 'Default Airtime Fees',
        description: 'Airtime purchase fees',
        transactionType: 'airtime',
        currency: 'NGN',
        feeType: 'percentage',
        percentageFee: 2.0, // 2%
        priority: 10
      },

      // Data rules
      {
        ruleId: 'DATA_DEFAULT',
        name: 'Default Data Fees',
        description: 'Data purchase fees',
        transactionType: 'data',
        currency: 'NGN',
        feeType: 'percentage',
        percentageFee: 3.0, // 3%
        priority: 10
      },

      // Merchant payment rules
      {
        ruleId: 'MERCHANT_DEFAULT',
        name: 'Default Merchant Fees',
        description: 'Merchant payment fees',
        transactionType: 'merchant_payment',
        currency: 'NGN',
        feeType: 'percentage',
        percentageFee: 1.5, // 1.5%
        conditions: {
          percentageCap: 10000 // 100 NGN cap
        },
        priority: 10
      },

      // Card payment rules
      {
        ruleId: 'CARD_DEFAULT',
        name: 'Default Card Payment Fees',
        description: 'Card payment fees',
        transactionType: 'card_payment',
        currency: 'NGN',
        feeType: 'percentage',
        percentageFee: 2.5, // 2.5%
        conditions: {
          percentageCap: 15000 // 150 NGN cap
        },
        priority: 10
      }
    ];

    const createdRules = [];
    for (const ruleData of defaultRules) {
      const existingRule = await CommissionRule.findOne({ ruleId: ruleData.ruleId });
      if (!existingRule) {
        const rule = new CommissionRule(ruleData);
        await rule.save();
        createdRules.push(rule);
      }
    }

    return createdRules;
  }

  // Calculate commission for a transaction
  static async calculateCommission(transactionType, amount, currency = 'NGN', userContext = {}) {
    try {
      return await CommissionRule.calculateCommission(transactionType, amount, currency, userContext);
    } catch (error) {
      throw new Error(`Commission calculation failed: ${error.message}`);
    }
  }

  // Process commission for a transaction
  static async processCommission(transactionData) {
    const session = await CommissionRule.startSession();
    session.startTransaction();

    try {
      const {
        transactionType,
        amount,
        currency = 'NGN',
        userId,
        merchantId,
        transactionId,
        reference,
        provider = 'internal'
      } = transactionData;

      // Calculate commission
      const commissionCalc = await this.calculateCommission(transactionType, amount, currency, {
        userId,
        dailyTransferCount: transactionData.dailyTransferCount || 0
      });

      if (commissionCalc.totalFee === 0) {
        await session.commitTransaction();
        return { commission: 0, fee: 0, govtFee: 0, ledgerEntries: [] };
      }

      const ledgerEntries = [];

      // Get system wallets
      const commissionWallet = await WalletService.getCommissionWallet(currency);
      const providerWallet = await WalletService.getProviderWallet(provider, currency);

      if (!commissionWallet) {
        throw new Error('Commission wallet not found');
      }

      // Process platform commission
      if (commissionCalc.fee > 0) {
        const userWallet = await WalletService.getUserWallet(userId, currency);
        if (userWallet) {
          const transferResult = await WalletService.transfer(
            userWallet.walletId,
            commissionWallet.walletId,
            commissionCalc.fee,
            {
              transactionId,
              reference: `${reference}-COMMISSION`,
              type: 'fee_collection',
              provider,
              userId,
              description: `Platform commission for ${transactionType}`,
              fee: commissionCalc.fee,
              commission: commissionCalc.fee
            }
          );
          ledgerEntries.push(transferResult.ledgerEntry);
        }
      }

      // Process government fee (goes to commission wallet)
      if (commissionCalc.govtFee > 0) {
        const userWallet = await WalletService.getUserWallet(userId, currency);
        if (userWallet) {
          const transferResult = await WalletService.transfer(
            userWallet.walletId,
            commissionWallet.walletId,
            commissionCalc.govtFee,
            {
              transactionId,
              reference: `${reference}-GOVT-FEE`,
              type: 'fee_collection',
              provider,
              userId,
              description: `Government fee for ${transactionType}`,
              fee: commissionCalc.govtFee
            }
          );
          ledgerEntries.push(transferResult.ledgerEntry);
        }
      }

      // Process provider fee (if applicable)
      if (transactionData.providerFee > 0 && providerWallet) {
        const settlementWallet = await WalletService.getSettlementWallet(currency);
        if (settlementWallet) {
          const transferResult = await WalletService.transfer(
            settlementWallet.walletId,
            providerWallet.walletId,
            transactionData.providerFee,
            {
              transactionId,
              reference: `${reference}-PROVIDER-FEE`,
              type: 'fee_collection',
              provider,
              userId,
              description: `Provider fee for ${transactionType}`,
              providerFee: transactionData.providerFee
            }
          );
          ledgerEntries.push(transferResult.ledgerEntry);
        }
      }

      await session.commitTransaction();

      return {
        commission: commissionCalc.fee,
        fee: commissionCalc.totalFee,
        govtFee: commissionCalc.govtFee,
        providerFee: transactionData.providerFee || 0,
        ledgerEntries
      };

    } catch (error) {
      await session.abortTransaction();
      throw new Error(`Commission processing failed: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  // Get commission rules
  static async getCommissionRules(filters = {}) {
    try {
      const query = { isActive: true };

      if (filters.transactionType) query.transactionType = filters.transactionType;
      if (filters.currency) query.currency = filters.currency;

      return await CommissionRule.find(query).sort({ priority: -1 });
    } catch (error) {
      throw new Error(`Failed to get commission rules: ${error.message}`);
    }
  }

  // Update commission rule
  static async updateCommissionRule(ruleId, updates) {
    try {
      const rule = await CommissionRule.findOne({ ruleId });
      if (!rule) {
        throw new Error('Commission rule not found');
      }

      Object.assign(rule, updates);
      return await rule.save();
    } catch (error) {
      throw new Error(`Failed to update commission rule: ${error.message}`);
    }
  }

  // Create custom commission rule
  static async createCommissionRule(ruleData) {
    try {
      const ruleId = `RULE-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const rule = new CommissionRule({ ...ruleData, ruleId });
      return await rule.save();
    } catch (error) {
      throw new Error(`Failed to create commission rule: ${error.message}`);
    }
  }

  // Get commission statistics
  static async getCommissionStats(currency = 'NGN', dateRange = {}) {
    try {
      const matchQuery = {
        currency,
        type: 'fee_collection',
        status: 'completed'
      };

      if (dateRange.start) {
        matchQuery.createdAt = { $gte: new Date(dateRange.start) };
      }
      if (dateRange.end) {
        matchQuery.createdAt = { ...matchQuery.createdAt, $lte: new Date(dateRange.end) };
      }

      const stats = await Ledger.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              type: '$type',
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: '$_id.date',
            fees: {
              $push: {
                type: '$_id.type',
                amount: '$totalAmount',
                count: '$count'
              }
            },
            totalFees: { $sum: '$totalAmount' }
          }
        },
        { $sort: { '_id': -1 } }
      ]);

      return stats;
    } catch (error) {
      throw new Error(`Failed to get commission stats: ${error.message}`);
    }
  }
}

module.exports = CommissionService;