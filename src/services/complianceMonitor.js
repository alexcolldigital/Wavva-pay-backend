const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AML = require('../models/AML');
const AuditTrail = require('../models/AuditTrail');
const logger = require('../utils/logger');
const security = require('../utils/security');
const cbnReporting = require('./cbnReporting');
const sanctionsScreening = require('./sanctionsScreening');

class ComplianceMonitor {
  constructor() {
    this.riskThresholds = {
      low: 25,
      medium: 50,
      high: 75
    };
    
    this.transactionLimits = {
      tier1: { daily: 100000, monthly: 300000, single: 50000 },
      tier2: { daily: 500000, monthly: 1500000, single: 200000 },
      tier3: { daily: 2000000, monthly: 6000000, single: 1000000 }
    };
  }

  // Monitor transaction for compliance issues
  async monitorTransaction(transaction) {
    try {
      const compliance = {
        riskScore: 0,
        riskLevel: 'low',
        flagged: false,
        flagReason: '',
        reviewRequired: false,
        sanctionsChecked: false,
        sanctionsResult: 'clear'
      };

      // 1. Amount-based risk assessment
      const amountRisk = this.assessAmountRisk(transaction.amount);
      compliance.riskScore += amountRisk;

      // 2. Frequency-based risk assessment
      const frequencyRisk = await this.assessFrequencyRisk(transaction);
      compliance.riskScore += frequencyRisk;

      // 3. Pattern-based risk assessment
      const patternRisk = await this.assessPatternRisk(transaction);
      compliance.riskScore += patternRisk;

      // 4. Geographic risk assessment
      const geoRisk = this.assessGeographicRisk(transaction);
      compliance.riskScore += geoRisk;

      // 5. User risk profile assessment
      const userRisk = await this.assessUserRisk(transaction.senderId);
      compliance.riskScore += userRisk;

      // Determine risk level
      compliance.riskLevel = this.determineRiskLevel(compliance.riskScore);

      // Flag high-risk transactions
      if (compliance.riskScore >= this.riskThresholds.high) {
        compliance.flagged = true;
        compliance.reviewRequired = true;
        compliance.flagReason = 'High risk score detected';
      }

      // Check for suspicious patterns
      const suspiciousPatterns = await this.checkSuspiciousPatterns(transaction);
      if (suspiciousPatterns.length > 0) {
        compliance.flagged = true;
        compliance.reviewRequired = true;
        compliance.flagReason = suspiciousPatterns.join(', ');
      }

      // Sanctions screening for high-value transactions
      if (transaction.amount >= 1000000) { // ₦1M+
        const sanctionsResult = await this.performSanctionsScreening(transaction);
        compliance.sanctionsChecked = true;
        compliance.sanctionsResult = sanctionsResult.status;
        
        if (sanctionsResult.status === 'hit') {
          compliance.flagged = true;
          compliance.reviewRequired = true;
          compliance.flagReason = 'Sanctions screening hit';
        }
      }

      // Update transaction with compliance data
      transaction.compliance = compliance;
      await transaction.save();

      // Log compliance assessment
      logger.info('Transaction compliance assessed', {
        transactionId: transaction.transactionId,
        riskScore: compliance.riskScore,
        riskLevel: compliance.riskLevel,
        flagged: compliance.flagged
      });

      // Create AML record for flagged transactions
      if (compliance.flagged) {
        await this.createAMLRecord(transaction, compliance);
      }

      // Auto-report to CBN if required
      if (transaction.amount >= 5000000) { // ₦5M+ requires CBN reporting
        await this.scheduleReporting(transaction);
      }

      return compliance;
    } catch (error) {
      logger.error('Compliance monitoring failed', {
        transactionId: transaction.transactionId,
        error: error.message
      });
      throw error;
    }
  }

  // Assess risk based on transaction amount
  assessAmountRisk(amount) {
    if (amount >= 10000000) return 30; // ₦10M+
    if (amount >= 5000000) return 20;  // ₦5M+
    if (amount >= 1000000) return 10;  // ₦1M+
    if (amount >= 500000) return 5;    // ₦500K+
    return 0;
  }

  // Assess risk based on transaction frequency
  async assessFrequencyRisk(transaction) {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      
      const dailyTransactions = await Transaction.countDocuments({
        senderId: transaction.senderId,
        createdAt: { $gte: startOfDay },
        status: { $in: ['completed', 'processing'] }
      });

      if (dailyTransactions >= 50) return 25;
      if (dailyTransactions >= 20) return 15;
      if (dailyTransactions >= 10) return 10;
      if (dailyTransactions >= 5) return 5;
      return 0;
    } catch (error) {
      logger.error('Frequency risk assessment failed', error);
      return 0;
    }
  }

  // Assess risk based on transaction patterns
  async assessPatternRisk(transaction) {
    try {
      let riskScore = 0;
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Check for round number transactions (potential structuring)
      if (transaction.amount % 100000 === 0) {
        riskScore += 5;
      }

      // Check for rapid succession transactions
      const recentTransactions = await Transaction.find({
        senderId: transaction.senderId,
        createdAt: { $gte: last24Hours }
      }).sort({ createdAt: -1 }).limit(5);

      if (recentTransactions.length >= 3) {
        const timeDiffs = [];
        for (let i = 1; i < recentTransactions.length; i++) {
          const diff = recentTransactions[i-1].createdAt - recentTransactions[i].createdAt;
          timeDiffs.push(diff / (1000 * 60)); // Convert to minutes
        }
        
        const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
        if (avgTimeDiff < 5) { // Less than 5 minutes between transactions
          riskScore += 15;
        }
      }

      // Check for unusual time patterns (late night transactions)
      const hour = transaction.createdAt.getHours();
      if (hour >= 23 || hour <= 5) {
        riskScore += 5;
      }

      return riskScore;
    } catch (error) {
      logger.error('Pattern risk assessment failed', error);
      return 0;
    }
  }

  // Assess geographic risk
  assessGeographicRisk(transaction) {
    if (!transaction.location) return 0;

    // High-risk states/regions (example)
    const highRiskStates = ['Borno', 'Yobe', 'Adamawa'];
    if (highRiskStates.includes(transaction.location.state)) {
      return 10;
    }

    return 0;
  }

  // Assess user risk profile
  async assessUserRisk(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return 20; // Unknown user = high risk

      let riskScore = 0;

      // KYC status risk
      if (!user.kyc.verified) riskScore += 15;
      if (user.kyc.tier === 1) riskScore += 5;

      // Account age risk
      const accountAge = Date.now() - user.createdAt.getTime();
      const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);
      if (daysSinceCreation < 7) riskScore += 10;
      if (daysSinceCreation < 30) riskScore += 5;

      // PEP (Politically Exposed Person) risk
      if (user.pep) riskScore += 20;

      // Previous compliance issues
      if (user.riskProfile.level === 'high') riskScore += 15;
      if (user.riskProfile.level === 'medium') riskScore += 10;

      return riskScore;
    } catch (error) {
      logger.error('User risk assessment failed', error);
      return 10; // Default moderate risk
    }
  }

  // Check for suspicious patterns
  async checkSuspiciousPatterns(transaction) {
    const patterns = [];

    try {
      // Pattern 1: Structuring (multiple transactions just under reporting threshold)
      const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentLargeTransactions = await Transaction.find({
        senderId: transaction.senderId,
        amount: { $gte: 4500000, $lt: 5000000 }, // Just under ₦5M threshold
        createdAt: { $gte: last7Days }
      });

      if (recentLargeTransactions.length >= 3) {
        patterns.push('Potential structuring detected');
      }

      // Pattern 2: Smurfing (multiple small transactions to same recipient)
      if (transaction.recipientId) {
        const smallTransactionsToSameRecipient = await Transaction.countDocuments({
          senderId: transaction.senderId,
          recipientId: transaction.recipientId,
          amount: { $lt: 100000 }, // Under ₦100K
          createdAt: { $gte: last7Days }
        });

        if (smallTransactionsToSameRecipient >= 10) {
          patterns.push('Potential smurfing detected');
        }
      }

      // Pattern 3: Rapid movement of funds
      const rapidMovement = await Transaction.find({
        $or: [
          { senderId: transaction.senderId },
          { recipientId: transaction.senderId }
        ],
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
      });

      if (rapidMovement.length >= 5) {
        patterns.push('Rapid fund movement detected');
      }

      return patterns;
    } catch (error) {
      logger.error('Suspicious pattern check failed', error);
      return [];
    }
  }

  // Perform sanctions screening
  async performSanctionsScreening(transaction) {
    try {
      const user = await User.findById(transaction.senderId);
      if (!user) {
        return { status: 'error', message: 'User not found' };
      }

      const screeningResult = await sanctionsScreening.screenUser({
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: user.kyc.dateOfBirth,
        nationality: 'Nigerian'
      });

      return screeningResult;
    } catch (error) {
      logger.error('Sanctions screening failed', error);
      return { status: 'error', message: error.message };
    }
  }

  // Determine risk level based on score
  determineRiskLevel(score) {
    if (score >= this.riskThresholds.high) return 'high';
    if (score >= this.riskThresholds.medium) return 'medium';
    return 'low';
  }

  // Create AML record for flagged transactions
  async createAMLRecord(transaction, compliance) {
    try {
      const amlRecord = new AML({
        userId: transaction.senderId,
        transactionId: transaction._id,
        riskScore: compliance.riskScore,
        riskLevel: compliance.riskLevel,
        flagReason: compliance.flagReason,
        status: 'pending_review',
        detectedAt: new Date(),
        riskFactors: [compliance.flagReason]
      });

      await amlRecord.save();

      logger.info('AML record created', {
        amlId: amlRecord._id,
        transactionId: transaction.transactionId,
        riskLevel: compliance.riskLevel
      });

      return amlRecord;
    } catch (error) {
      logger.error('AML record creation failed', error);
      throw error;
    }
  }

  // Schedule CBN reporting
  async scheduleReporting(transaction) {
    try {
      transaction.reporting.reportable = true;
      await transaction.save();

      // Queue for next reporting cycle
      logger.info('Transaction queued for CBN reporting', {
        transactionId: transaction.transactionId,
        amount: transaction.amount
      });
    } catch (error) {
      logger.error('CBN reporting scheduling failed', error);
    }
  }

  // Validate transaction limits based on KYC tier
  async validateTransactionLimits(userId, amount, type = 'single') {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const limits = user.transactionLimits;
      
      switch (type) {
        case 'single':
          if (amount > limits.single) {
            return {
              valid: false,
              message: `Transaction amount exceeds single transaction limit of ₦${limits.single.toLocaleString()}`,
              limit: limits.single
            };
          }
          break;
          
        case 'daily':
          // Check daily spending (simplified - should check actual daily total)
          if (amount > limits.daily) {
            return {
              valid: false,
              message: `Transaction amount exceeds daily limit of ₦${limits.daily.toLocaleString()}`,
              limit: limits.daily
            };
          }
          break;
          
        case 'monthly':
          // Check monthly spending (simplified - should check actual monthly total)
          if (amount > limits.monthly) {
            return {
              valid: false,
              message: `Transaction amount exceeds monthly limit of ₦${limits.monthly.toLocaleString()}`,
              limit: limits.monthly
            };
          }
          break;
      }

      return { valid: true };
    } catch (error) {
      logger.error('Transaction limit validation failed', error);
      throw error;
    }
  }

  // Generate compliance report
  async generateComplianceReport(startDate, endDate) {
    try {
      const [
        totalTransactions,
        flaggedTransactions,
        highRiskTransactions,
        reportableTransactions,
        amlCases
      ] = await Promise.all([
        Transaction.countDocuments({
          createdAt: { $gte: startDate, $lte: endDate }
        }),
        Transaction.countDocuments({
          'compliance.flagged': true,
          createdAt: { $gte: startDate, $lte: endDate }
        }),
        Transaction.countDocuments({
          'compliance.riskLevel': 'high',
          createdAt: { $gte: startDate, $lte: endDate }
        }),
        Transaction.countDocuments({
          'reporting.reportable': true,
          createdAt: { $gte: startDate, $lte: endDate }
        }),
        AML.countDocuments({
          createdAt: { $gte: startDate, $lte: endDate }
        })
      ]);

      const report = {
        period: { startDate, endDate },
        summary: {
          totalTransactions,
          flaggedTransactions,
          highRiskTransactions,
          reportableTransactions,
          amlCases,
          flaggedRate: ((flaggedTransactions / totalTransactions) * 100).toFixed(2) + '%'
        },
        generatedAt: new Date(),
        generatedBy: 'ComplianceMonitor'
      };

      logger.info('Compliance report generated', report.summary);
      return report;
    } catch (error) {
      logger.error('Compliance report generation failed', error);
      throw error;
    }
  }
}

// Static utility methods for testing and direct use
ComplianceMonitor.validateBVN = (bvn) => /^\d{11}$/.test(bvn);

ComplianceMonitor.validateNigerianPhone = (phone) => /^\+234[789]\d{9}$/.test(phone);

ComplianceMonitor.calculateRiskScore = (transactions) => {
  let score = 0;
  // Flag structuring: multiple transactions just under ₦5M
  const structuring = transactions.filter(t => t.amount >= 4500000 && t.amount < 5000000);
  if (structuring.length >= 3) score += 80;
  else if (structuring.length >= 2) score += 50;
  // High value transactions
  transactions.forEach(t => {
    if (t.amount >= 5000000) score += 20;
    else if (t.amount >= 1000000) score += 10;
  });
  return Math.min(score, 100);
};

ComplianceMonitor.requiresCBNReporting = (transaction) => transaction.amount >= 5000000;

ComplianceMonitor.getTierLimit = (tier) => {
  const limits = { 1: 100000, 2: 500000, 3: 2000000 };
  return limits[tier] || 0;
};

module.exports = new ComplianceMonitor();
Object.assign(module.exports, {
  validateBVN: ComplianceMonitor.validateBVN,
  validateNigerianPhone: ComplianceMonitor.validateNigerianPhone,
  calculateRiskScore: ComplianceMonitor.calculateRiskScore,
  requiresCBNReporting: ComplianceMonitor.requiresCBNReporting,
  getTierLimit: ComplianceMonitor.getTierLimit
});