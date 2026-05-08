const axios = require('axios');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const KYC = require('../models/KYC');
const AML = require('../models/AML');

class CBNReportingService {
  constructor() {
    this.reportingEndpoint = process.env.CBN_REPORTING_ENDPOINT;
    this.institutionCode = process.env.CBN_INSTITUTION_CODE;
    this.reportingKey = process.env.CBN_REPORTING_KEY;
    this.client = axios.create({
      baseURL: this.reportingEndpoint,
      headers: {
        'Authorization': `Bearer ${this.reportingKey}`,
        'Content-Type': 'application/json',
        'Institution-Code': this.institutionCode,
      },
    });
  }

  async generateDailyTransactionReport(date = new Date()) {
    try {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      const transactions = await Transaction.find({
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'completed',
      }).populate('sender', 'firstName lastName email phone');

      const report = {
        reportId: uuidv4(),
        reportType: 'DAILY_TRANSACTION_REPORT',
        institutionCode: this.institutionCode,
        reportDate: date.toISOString().split('T')[0],
        generatedAt: new Date().toISOString(),
        summary: {
          totalTransactions: transactions.length,
          totalValue: transactions.reduce((sum, tx) => sum + tx.amount, 0),
          averageTransactionValue: transactions.length > 0 ? 
            transactions.reduce((sum, tx) => sum + tx.amount, 0) / transactions.length : 0,
        },
        transactions: transactions.map(tx => ({
          transactionId: tx._id,
          reference: tx.reference || tx._id,
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          timestamp: tx.createdAt,
          userId: tx.sender._id,
          userDetails: {
            name: `${tx.sender.firstName} ${tx.sender.lastName}`,
            email: tx.sender.email,
            phone: tx.sender.phone,
          },
          status: tx.status,
        })),
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate daily transaction report', {
        date: date.toISOString(),
        error: error.message,
      });
      throw error;
    }
  }

  async generateSuspiciousActivityReport() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const suspiciousActivities = await AML.find({
        createdAt: { $gte: thirtyDaysAgo },
        riskLevel: { $in: ['high', 'critical'] },
        status: { $in: ['open', 'under_investigation', 'escalated'] },
      }).populate('userId', 'firstName lastName email phone');

      const report = {
        reportId: uuidv4(),
        reportType: 'SUSPICIOUS_ACTIVITY_REPORT',
        institutionCode: this.institutionCode,
        reportPeriod: {
          startDate: thirtyDaysAgo.toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
        },
        generatedAt: new Date().toISOString(),
        summary: {
          totalSuspiciousActivities: suspiciousActivities.length,
          highRiskCount: suspiciousActivities.filter(a => a.riskLevel === 'high').length,
          criticalRiskCount: suspiciousActivities.filter(a => a.riskLevel === 'critical').length,
        },
        activities: suspiciousActivities.map(activity => ({
          alertId: activity._id,
          userId: activity.userId._id,
          userDetails: activity.userId ? {
            name: `${activity.userId.firstName} ${activity.userId.lastName}`,
            email: activity.userId.email,
            phone: activity.userId.phone,
          } : null,
          alertType: activity.alertType,
          riskScore: activity.riskScore,
          riskLevel: activity.riskLevel,
          transactionDetails: activity.transactionDetails,
          timestamp: activity.createdAt,
          status: activity.status,
        })),
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate suspicious activity report', {
        error: error.message,
      });
      throw error;
    }
  }

  async generateKYCComplianceReport() {
    try {
      const kycRecords = await KYC.find({}).populate('userId', 'firstName lastName email phone createdAt');

      const report = {
        reportId: uuidv4(),
        reportType: 'KYC_COMPLIANCE_REPORT',
        institutionCode: this.institutionCode,
        generatedAt: new Date().toISOString(),
        summary: {
          totalUsers: kycRecords.length,
          verifiedUsers: kycRecords.filter(k => k.status === 'approved').length,
          pendingVerification: kycRecords.filter(k => k.status === 'pending').length,
          rejectedUsers: kycRecords.filter(k => k.status === 'rejected').length,
          complianceRate: kycRecords.length > 0 ? 
            (kycRecords.filter(k => k.status === 'approved').length / kycRecords.length) * 100 : 0,
        },
        kycRecords: kycRecords.map(kyc => ({
          userId: kyc.userId._id,
          userDetails: {
            name: `${kyc.userId.firstName} ${kyc.userId.lastName}`,
            email: kyc.userId.email,
            phone: kyc.userId.phone,
            registrationDate: kyc.userId.createdAt,
          },
          kycStatus: kyc.status,
          riskLevel: kyc.riskLevel,
          verificationDate: kyc.verificationDetails.submittedAt,
          reviewDate: kyc.verificationDetails.reviewedAt,
          transactionLimits: kyc.transactionLimits,
        })),
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate KYC compliance report', {
        error: error.message,
      });
      throw error;
    }
  }

  async submitReport(report) {
    try {
      if (!this.reportingEndpoint || this.reportingEndpoint === 'https://cbn.gov.ng/api/reporting') {
        // In development/testing, just log the report
        logger.info('CBN Report Generated (Development Mode)', {
          reportType: report.reportType,
          reportId: report.reportId,
          summary: report.summary,
        });
        return {
          success: true,
          reportId: report.reportId,
          status: 'submitted_dev_mode',
        };
      }

      const response = await this.client.post('/submit-report', report);
      
      logger.info('CBN report submitted successfully', {
        reportType: report.reportType,
        reportId: report.reportId,
        submissionId: response.data.submissionId,
      });

      return {
        success: true,
        reportId: report.reportId,
        submissionId: response.data.submissionId,
        status: 'submitted',
      };
    } catch (error) {
      logger.error('Failed to submit CBN report', {
        reportType: report.reportType,
        reportId: report.reportId,
        error: error.response?.data || error.message,
      });
      return {
        success: false,
        error: error.response?.data?.message || 'Report submission failed',
      };
    }
  }

  async generateAndSubmitDailyReport() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const report = await this.generateDailyTransactionReport(yesterday);
      const result = await this.submitReport(report);
      
      logger.info('Daily CBN report processed', {
        date: yesterday.toISOString().split('T')[0],
        success: result.success,
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to process daily CBN report', {
        error: error.message,
      });
      throw error;
    }
  }

  async generateAndSubmitWeeklySAR() {
    try {
      const report = await this.generateSuspiciousActivityReport();
      const result = await this.submitReport(report);
      
      logger.info('Weekly SAR report processed', {
        success: result.success,
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to process weekly SAR report', {
        error: error.message,
      });
      throw error;
    }
  }

  async generateAndSubmitMonthlyKYC() {
    try {
      const report = await this.generateKYCComplianceReport();
      const result = await this.submitReport(report);
      
      logger.info('Monthly KYC report processed', {
        success: result.success,
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to process monthly KYC report', {
        error: error.message,
      });
      throw error;
    }
  }

  startScheduledReporting() {
    // Daily transaction report at 2 AM
    cron.schedule('0 2 * * *', async () => {
      logger.info('Starting scheduled daily CBN report');
      await this.generateAndSubmitDailyReport();
    });

    // Weekly SAR report on Mondays at 3 AM
    cron.schedule('0 3 * * 1', async () => {
      logger.info('Starting scheduled weekly SAR report');
      await this.generateAndSubmitWeeklySAR();
    });

    // Monthly KYC report on 1st of each month at 4 AM
    cron.schedule('0 4 1 * *', async () => {
      logger.info('Starting scheduled monthly KYC report');
      await this.generateAndSubmitMonthlyKYC();
    });

    logger.info('CBN scheduled reporting started');
  }
}

module.exports = new CBNReportingService();