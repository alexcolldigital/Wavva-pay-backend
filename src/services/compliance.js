const KYC = require('../models/KYC');
const AML = require('../models/AML');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const smileIdentity = require('./smileIdentity');
const sanctionsScreening = require('./sanctionsScreening');
const cbnReporting = require('./cbnReporting');

class ComplianceService {
  
  // Enhanced KYC Methods
  static async submitKYC(userId, kycData) {
    try {
      // Check if KYC already exists
      const existingKYC = await KYC.findOne({ userId });
      if (existingKYC && existingKYC.status === 'approved') {
        throw new Error('KYC already approved for this user');
      }
      
      // Sanctions screening first
      const user = await User.findById(userId);
      const sanctionsResult = await sanctionsScreening.screenEntity({
        name: `${user.firstName} ${user.lastName}`,
        country: kycData.personalInfo.address.country,
        dateOfBirth: kycData.personalInfo.dateOfBirth,
        type: 'INDIVIDUAL',
      });
      
      if (sanctionsResult.isSanctioned) {
        logger.warn('User failed sanctions screening', { userId, sanctionsResult });
        throw new Error('Unable to process KYC due to compliance restrictions');
      }
      
      // Create or update KYC record
      const kyc = existingKYC || new KYC({ userId });
      Object.assign(kyc, kycData);
      kyc.status = 'pending';
      kyc.verificationDetails.submittedAt = new Date();
      
      // Add sanctions screening results
      kyc.sanctionsScreening = {
        screenedAt: new Date(),
        riskScore: sanctionsResult.riskScore,
        isPEP: sanctionsResult.isPEP,
        cleared: !sanctionsResult.isSanctioned,
      };
      
      await kyc.save();
      
      // Initiate Smile Identity verification
      if (kycData.documents.selfieImage && kycData.documents.idFrontImage) {
        const verificationResult = await smileIdentity.verifyIdentity({
          userId: userId.toString(),
          selfieImage: kycData.documents.selfieImage,
          idFrontImage: kycData.documents.idFrontImage,
          idType: kycData.documents.idType,
          idNumber: kycData.documents.idNumber,
          firstName: user.firstName,
          lastName: user.lastName,
          dateOfBirth: kycData.personalInfo.dateOfBirth,
          country: kycData.personalInfo.address.country,
        });
        
        if (verificationResult.success) {
          kyc.smileIdentityJobId = verificationResult.jobId;
          await kyc.save();
        }
      }
      
      logger.info('Enhanced KYC submitted', { userId, kycId: kyc._id });
      
      return kyc;
    } catch (error) {
      logger.error('Enhanced KYC submission failed', { userId, error: error.message });
      throw error;
    }
  }
  
  static async reviewKYC(kycId, reviewerId, decision, rejectionReason = null) {
    try {
      const kyc = await KYC.findById(kycId);
      if (!kyc) throw new Error('KYC record not found');
      
      kyc.status = decision;
      kyc.verificationDetails.reviewedAt = new Date();
      kyc.verificationDetails.reviewedBy = reviewerId;
      
      if (decision === 'rejected') {
        kyc.verificationDetails.rejectionReason = rejectionReason;
      } else if (decision === 'approved') {
        // Set expiry date (2 years from approval)
        kyc.verificationDetails.expiryDate = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
        
        // Update user KYC status
        await User.findByIdAndUpdate(kyc.userId, { 
          'kyc.verified': true,
          'kyc.verifiedAt': new Date()
        });
      }
      
      await kyc.save();
      logger.info('KYC reviewed', { kycId, decision, reviewerId });
      
      return kyc;
    } catch (error) {
      logger.error('KYC review failed', { kycId, error: error.message });
      throw error;
    }
  }
  
  // Enhanced AML Methods
  static async monitorTransaction(transactionData) {
    try {
      const alerts = [];
      
      // Sanctions screening for transaction parties
      const sanctionsResult = await sanctionsScreening.screenTransaction({
        transactionId: transactionData.transactionId,
        sender: transactionData.sender,
        recipient: transactionData.recipient,
      });
      
      if (sanctionsResult.isSanctioned) {
        alerts.push(await this.createAMLAlert(transactionData, 'sanctioned_entity', 95));
      }
      
      // High value transaction check (enhanced)
      if (transactionData.amount > 1000000) { // 10,000 NGN
        const riskScore = transactionData.amount > 5000000 ? 85 : 75; // 50,000 NGN threshold
        alerts.push(await this.createAMLAlert(transactionData, 'high_value_transaction', riskScore));
      }
      
      // Rapid succession check (enhanced)
      const recentTransactions = await Transaction.find({
        userId: transactionData.userId,
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
      });
      
      if (recentTransactions.length > 10) {
        const riskScore = Math.min(60 + (recentTransactions.length - 10) * 5, 90);
        alerts.push(await this.createAMLAlert(transactionData, 'rapid_succession', riskScore));
      }
      
      // Round amount pattern (enhanced)
      if (transactionData.amount % 100000 === 0 && transactionData.amount >= 500000) {
        alerts.push(await this.createAMLAlert(transactionData, 'round_amount_pattern', 45));
      }
      
      // Cross-border transaction check
      if (transactionData.recipient && transactionData.recipient.country !== 'NG') {
        alerts.push(await this.createAMLAlert(transactionData, 'cross_border', 55));
      }
      
      // Velocity check - daily transaction volume
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dailyTransactions = await Transaction.find({
        userId: transactionData.userId,
        createdAt: { $gte: today },
        status: { $in: ['completed', 'pending'] }
      });
      
      const dailyVolume = dailyTransactions.reduce((sum, tx) => sum + tx.amount, 0);
      if (dailyVolume > 10000000) { // 100,000 NGN daily volume
        alerts.push(await this.createAMLAlert(transactionData, 'high_daily_volume', 70));
      }
      
      return alerts;
    } catch (error) {
      logger.error('Enhanced AML monitoring failed', { transactionData, error: error.message });
      throw error;
    }
  }
  
  static async createAMLAlert(transactionData, alertType, riskScore) {
    try {
      const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low';
      
      const amlAlert = new AML({
        userId: transactionData.userId,
        transactionId: transactionData.transactionId,
        alertType,
        riskScore,
        riskLevel,
        transactionDetails: {
          amount: transactionData.amount,
          currency: transactionData.currency || 'NGN',
          type: transactionData.type
        }
      });
      
      await amlAlert.save();
      
      // Auto-escalate high-risk alerts
      if (riskLevel === 'high') {
        await this.escalateAlert(amlAlert._id);
      }
      
      logger.info('AML alert created', { 
        alertId: amlAlert._id, 
        alertType, 
        riskLevel,
        userId: transactionData.userId 
      });
      
      return amlAlert;
    } catch (error) {
      logger.error('AML alert creation failed', { transactionData, error: error.message });
      throw error;
    }
  }
  
  static async escalateAlert(alertId) {
    try {
      const alert = await AML.findById(alertId);
      if (!alert) throw new Error('Alert not found');
      
      alert.status = 'escalated';
      alert.investigation.escalatedTo = 'compliance_team';
      alert.actionsPerformed.push({
        action: 'manual_review',
        performedAt: new Date(),
        performedBy: 'system'
      });
      
      await alert.save();
      
      // In production, send notification to compliance team
      logger.warn('AML alert escalated', { alertId, userId: alert.userId });
      
      return alert;
    } catch (error) {
      logger.error('Alert escalation failed', { alertId, error: error.message });
      throw error;
    }
  }
  
  // Enhanced Compliance Checks
  static async checkTransactionCompliance(userId, amount, type, recipientData = null) {
    try {
      // Check KYC status
      const user = await User.findById(userId);
      const kyc = await KYC.findOne({ userId });
      
      if (!kyc || kyc.status !== 'approved') {
        if (amount > 50000) { // 500 NGN limit for non-KYC users
          return {
            allowed: false,
            reason: 'KYC verification required for transactions above ₦500'
          };
        }
      }
      
      // Enhanced sanctions screening for recipient
      if (recipientData) {
        const sanctionsResult = await sanctionsScreening.screenEntity({
          name: recipientData.name,
          country: recipientData.country,
          type: 'INDIVIDUAL',
        });
        
        if (sanctionsResult.isSanctioned) {
          return {
            allowed: false,
            reason: 'Transaction blocked due to compliance restrictions'
          };
        }
      }
      
      // Check transaction limits
      if (kyc && kyc.status === 'approved') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dailyTransactions = await Transaction.aggregate([
          {
            $match: {
              userId: userId,
              createdAt: { $gte: today },
              status: { $in: ['completed', 'pending'] }
            }
          },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$amount' }
            }
          }
        ]);
        
        const dailyTotal = dailyTransactions[0]?.totalAmount || 0;
        
        if (dailyTotal + amount > kyc.transactionLimits.dailyLimit) {
          return {
            allowed: false,
            reason: 'Daily transaction limit exceeded'
          };
        }
        
        if (amount > kyc.transactionLimits.singleTransactionLimit) {
          return {
            allowed: false,
            reason: 'Single transaction limit exceeded'
          };
        }
      }
      
      return { allowed: true };
    } catch (error) {
      logger.error('Enhanced compliance check failed', { userId, amount, error: error.message });
      return {
        allowed: false,
        reason: 'Compliance check failed'
      };
    }
  }
  
  // Enhanced Sanctions Screening
  static async screenForSanctions(name, country, dateOfBirth = null) {
    try {
      return await sanctionsScreening.screenEntity({
        name,
        country,
        dateOfBirth,
        type: 'INDIVIDUAL',
      });
    } catch (error) {
      logger.error('Enhanced sanctions screening failed', { name, country, error: error.message });
      return { 
        success: false,
        isSanctioned: false,
        error: 'Sanctions screening failed'
      };
    }
  }
  
  // BVN Verification
  static async verifyBVN(userId, bvn) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');
      
      const verificationResult = await smileIdentity.verifyBVN(bvn, {
        userId: userId.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: user.dateOfBirth,
      });
      
      if (verificationResult.success) {
        // Update user record with BVN verification
        await User.findByIdAndUpdate(userId, {
          'kyc.bvnVerified': true,
          'kyc.bvnJobId': verificationResult.jobId,
        });
      }
      
      return verificationResult;
    } catch (error) {
      logger.error('BVN verification failed', { userId, error: error.message });
      return {
        success: false,
        error: 'BVN verification failed'
      };
    }
  }
  
  // Enhanced Due Diligence
  static async performEDD(userId) {
    try {
      const user = await User.findById(userId);
      const kyc = await KYC.findOne({ userId });
      
      if (!user || !kyc) {
        throw new Error('User or KYC record not found');
      }
      
      // Additional checks for high-risk users
      const eddChecks = {
        sanctionsScreening: await this.screenForSanctions(
          `${user.firstName} ${user.lastName}`,
          kyc.personalInfo.address.country,
          kyc.personalInfo.dateOfBirth
        ),
        sourceOfFunds: kyc.personalInfo.sourceOfIncome,
        transactionHistory: await this.analyzeTransactionHistory(userId),
        riskAssessment: await this.calculateUserRiskScore(userId),
      };
      
      // Update KYC with EDD results
      kyc.enhancedDueDiligence = {
        performedAt: new Date(),
        results: eddChecks,
        status: eddChecks.sanctionsScreening.isSanctioned ? 'failed' : 'passed',
      };
      
      await kyc.save();
      
      return eddChecks;
    } catch (error) {
      logger.error('Enhanced Due Diligence failed', { userId, error: error.message });
      throw error;
    }
  }
  
  static async analyzeTransactionHistory(userId) {
    try {
      const Transaction = require('../models/Transaction');
      const transactions = await Transaction.find({ 
        $or: [{ userId }, { sender: userId }] 
      }).sort({ createdAt: -1 }).limit(100);
      
      return {
        totalTransactions: transactions.length,
        totalVolume: transactions.reduce((sum, tx) => sum + tx.amount, 0),
        averageAmount: transactions.length > 0 ? 
          transactions.reduce((sum, tx) => sum + tx.amount, 0) / transactions.length : 0,
        suspiciousPatterns: this.detectSuspiciousPatterns(transactions),
      };
    } catch (error) {
      logger.error('Transaction history analysis failed', { userId, error: error.message });
      return null;
    }
  }
  
  static detectSuspiciousPatterns(transactions) {
    const patterns = [];
    
    // Check for round amount patterns
    const roundAmounts = transactions.filter(tx => tx.amount % 100000 === 0 && tx.amount >= 500000);
    if (roundAmounts.length > 5) {
      patterns.push('frequent_round_amounts');
    }
    
    // Check for rapid succession
    const rapidTransactions = transactions.filter((tx, index) => {
      if (index === 0) return false;
      const timeDiff = new Date(tx.createdAt) - new Date(transactions[index - 1].createdAt);
      return timeDiff < 60000; // Less than 1 minute apart
    });
    
    if (rapidTransactions.length > 3) {
      patterns.push('rapid_succession');
    }
    
    return patterns;
  }
  
  static async calculateUserRiskScore(userId) {
    try {
      const User = require('../models/User');
      const KYC = require('../models/KYC');
      const AML = require('../models/AML');
      
      const user = await User.findById(userId);
      const kyc = await KYC.findOne({ userId });
      const amlAlerts = await AML.find({ userId });
      
      let riskScore = 0;
      
      // KYC risk factors
      if (kyc) {
        if (kyc.riskLevel === 'high') riskScore += 30;
        else if (kyc.riskLevel === 'medium') riskScore += 15;
        
        if (kyc.personalInfo && kyc.personalInfo.address && kyc.personalInfo.address.country !== 'NG') {
          riskScore += 10;
        }
      }
      
      // AML alert history
      const highRiskAlerts = amlAlerts.filter(alert => alert.riskLevel === 'high');
      riskScore += highRiskAlerts.length * 20;
      
      // Account age (newer accounts are riskier)
      if (user) {
        const accountAge = (Date.now() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24); // days
        if (accountAge < 30) riskScore += 15;
        else if (accountAge < 90) riskScore += 10;
      }
      
      return Math.min(riskScore, 100);
    } catch (error) {
      logger.error('Risk score calculation failed', { userId, error: error.message });
      return 50; // Default medium risk
    }
  }
}

module.exports = ComplianceService;