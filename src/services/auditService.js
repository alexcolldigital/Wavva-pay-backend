const AuditTrail = require('../models/AuditTrail');
const SecurityUtils = require('../utils/security');
const logger = require('../utils/logger');

class AuditService {
  static async logActivity(auditData) {
    try {
      const {
        userId,
        action,
        category,
        details,
        result,
        riskLevel = 'low',
        complianceFlags = [],
        req = null
      } = auditData;

      // Extract request information if available
      const requestInfo = req ? {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
      } : {};

      // Generate integrity hash
      const auditHash = SecurityUtils.generateAuditHash(
        userId,
        action,
        new Date().toISOString(),
        { ...details, ...result }
      );

      const auditRecord = new AuditTrail({
        userId,
        action,
        category,
        details: {
          ...details,
          ...requestInfo
        },
        result,
        riskLevel,
        complianceFlags,
        hash: auditHash
      });

      await auditRecord.save();

      // Log high-risk activities
      if (riskLevel === 'high' || riskLevel === 'critical') {
        logger.warn('High-risk activity logged', {
          userId,
          action,
          riskLevel,
          auditId: auditRecord._id
        });
      }

      return auditRecord;
    } catch (error) {
      logger.error('Audit logging failed', {
        userId: auditData.userId,
        action: auditData.action,
        error: error.message
      });
      throw error;
    }
  }

  static async logAuthentication(userId, action, result, req) {
    return await this.logActivity({
      userId,
      action,
      category: 'authentication',
      details: {
        description: `User ${action}`,
        timestamp: new Date()
      },
      result,
      riskLevel: result.status === 'failure' ? 'medium' : 'low',
      req
    });
  }

  static async logKYCActivity(userId, action, details, result, req) {
    const complianceFlags = [];
    
    // Add compliance flags based on KYC activity
    if (action === 'kyc_submission' && result.status === 'success') {
      complianceFlags.push({
        flag: 'kyc_submitted',
        severity: 'info',
        description: 'KYC documentation submitted for review'
      });
    }

    return await this.logActivity({
      userId,
      action,
      category: 'kyc',
      details: {
        description: `KYC ${action}`,
        ...details
      },
      result,
      riskLevel: 'medium',
      complianceFlags,
      req
    });
  }

  static async logTransaction(userId, action, transactionData, result, req) {
    const riskLevel = this.assessTransactionRisk(transactionData);
    const complianceFlags = this.generateTransactionFlags(transactionData);

    return await this.logActivity({
      userId,
      action,
      category: 'transaction',
      details: {
        description: `Transaction ${action}`,
        transactionId: transactionData.transactionId,
        amount: transactionData.amount,
        currency: transactionData.currency,
        type: transactionData.type,
        recipient: SecurityUtils.maskSensitiveData(transactionData.recipient, 'account')
      },
      result,
      riskLevel,
      complianceFlags,
      req
    });
  }

  static async logComplianceActivity(userId, action, details, result, req) {
    return await this.logActivity({
      userId,
      action,
      category: 'compliance',
      details: {
        description: `Compliance ${action}`,
        ...details
      },
      result,
      riskLevel: 'high',
      complianceFlags: [{
        flag: 'compliance_check',
        severity: 'warning',
        description: 'Compliance activity performed'
      }],
      req
    });
  }

  static async logSecurityEvent(userId, action, details, result, req) {
    return await this.logActivity({
      userId,
      action,
      category: 'security',
      details: {
        description: `Security ${action}`,
        ...details
      },
      result,
      riskLevel: 'critical',
      complianceFlags: [{
        flag: 'security_event',
        severity: 'critical',
        description: 'Security-related event occurred'
      }],
      req
    });
  }

  static assessTransactionRisk(transactionData) {
    const { amount, type, recipient } = transactionData;
    
    // High-value transactions
    if (amount > 10000000) return 'critical'; // 100,000 NGN
    if (amount > 5000000) return 'high'; // 50,000 NGN
    if (amount > 1000000) return 'medium'; // 10,000 NGN
    
    // Cross-border transactions
    if (recipient && recipient.country && recipient.country !== 'NG') {
      return 'high';
    }
    
    return 'low';
  }

  static generateTransactionFlags(transactionData) {
    const flags = [];
    const { amount, type, recipient } = transactionData;
    
    if (amount > 10000000) {
      flags.push({
        flag: 'high_value_transaction',
        severity: 'critical',
        description: 'Transaction exceeds high-value threshold'
      });
    }
    
    if (recipient && recipient.country && recipient.country !== 'NG') {
      flags.push({
        flag: 'cross_border_transaction',
        severity: 'warning',
        description: 'International transaction detected'
      });
    }
    
    if (amount % 100000 === 0 && amount >= 500000) {
      flags.push({
        flag: 'round_amount_pattern',
        severity: 'info',
        description: 'Round amount transaction pattern'
      });
    }
    
    return flags;
  }

  static async getAuditTrail(userId, options = {}) {
    try {
      const {
        category,
        startDate,
        endDate,
        riskLevel,
        limit = 100,
        skip = 0
      } = options;

      const query = { userId };
      
      if (category) query.category = category;
      if (riskLevel) query.riskLevel = riskLevel;
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const auditRecords = await AuditTrail.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      return auditRecords;
    } catch (error) {
      logger.error('Failed to retrieve audit trail', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  static async getComplianceReport(startDate, endDate) {
    try {
      const matchStage = {
        timestamp: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };

      const report = await AuditTrail.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              category: '$category',
              riskLevel: '$riskLevel',
              status: '$result.status'
            },
            count: { $sum: 1 },
            users: { $addToSet: '$userId' }
          }
        },
        {
          $group: {
            _id: '$_id.category',
            activities: {
              $push: {
                riskLevel: '$_id.riskLevel',
                status: '$_id.status',
                count: '$count',
                uniqueUsers: { $size: '$users' }
              }
            },
            totalActivities: { $sum: '$count' }
          }
        }
      ]);

      return report;
    } catch (error) {
      logger.error('Failed to generate compliance report', {
        startDate,
        endDate,
        error: error.message
      });
      throw error;
    }
  }

  static async verifyAuditIntegrity(auditId) {
    try {
      const auditRecord = await AuditTrail.findById(auditId);
      if (!auditRecord) {
        return { valid: false, reason: 'Audit record not found' };
      }

      const calculatedHash = SecurityUtils.generateAuditHash(
        auditRecord.userId,
        auditRecord.action,
        auditRecord.timestamp.toISOString(),
        { ...auditRecord.details, ...auditRecord.result }
      );

      const isValid = SecurityUtils.secureCompare(auditRecord.hash, calculatedHash);
      
      return {
        valid: isValid,
        reason: isValid ? 'Audit record integrity verified' : 'Audit record has been tampered with'
      };
    } catch (error) {
      logger.error('Audit integrity verification failed', {
        auditId,
        error: error.message
      });
      return { valid: false, reason: 'Verification failed' };
    }
  }
}

module.exports = AuditService;