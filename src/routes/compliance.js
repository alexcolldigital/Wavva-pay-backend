const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// Inline admin guard — checks req.user.isAdmin set by authMiddleware
const adminAuthMiddleware = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
const ComplianceService = require('../services/compliance');
const cbnReporting = require('../services/cbnReporting');
const smileIdentity = require('../services/smileIdentity');
const sanctionsScreening = require('../services/sanctionsScreening');
const logger = require('../utils/logger');

// BVN Verification
router.post('/verify-bvn', authMiddleware, async (req, res) => {
  try {
    const { bvn } = req.body;
    
    if (!bvn || bvn.length !== 11) {
      return res.status(400).json({ error: 'Valid 11-digit BVN is required' });
    }
    
    const result = await ComplianceService.verifyBVN(req.user.id, bvn);
    
    res.json({
      success: result.success,
      message: result.success ? 'BVN verification initiated' : result.error,
      jobId: result.jobId,
    });
  } catch (error) {
    logger.error('BVN verification route error', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'BVN verification failed' });
  }
});

// Check BVN Verification Status
router.get('/bvn-status/:jobId', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await smileIdentity.getJobStatus(jobId);
    
    res.json({
      success: result.success,
      status: result.status,
      verified: result.result?.verified || false,
      confidence: result.confidence,
    });
  } catch (error) {
    logger.error('BVN status check error', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to check BVN status' });
  }
});

// Enhanced Due Diligence
router.post('/enhanced-due-diligence', authMiddleware, async (req, res) => {
  try {
    const result = await ComplianceService.performEDD(req.user.id);
    
    res.json({
      success: true,
      message: 'Enhanced Due Diligence completed',
      results: result,
    });
  } catch (error) {
    logger.error('EDD route error', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Enhanced Due Diligence failed' });
  }
});

// Sanctions Screening
router.post('/sanctions-screening', authMiddleware, async (req, res) => {
  try {
    const { name, country, dateOfBirth } = req.body;
    
    const result = await sanctionsScreening.screenEntity({
      name,
      country,
      dateOfBirth,
      type: 'INDIVIDUAL',
    });
    
    res.json({
      success: result.success,
      isSanctioned: result.isSanctioned,
      riskScore: result.riskScore,
      isPEP: result.isPEP,
      reasons: result.reasons,
    });
  } catch (error) {
    logger.error('Sanctions screening route error', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Sanctions screening failed' });
  }
});

// Admin Routes (require admin authentication)
const adminAuth = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Generate CBN Reports
router.post('/reports/daily', authMiddleware, adminAuthMiddleware, async (req, res) => {
  try {
    const { date } = req.body;
    const reportDate = date ? new Date(date) : new Date();
    
    const report = await cbnReporting.generateDailyTransactionReport(reportDate);
    const submission = await cbnReporting.submitReport(report);
    
    res.json({
      success: true,
      reportId: report.reportId,
      submissionId: submission.submissionId,
      status: submission.status,
    });
  } catch (error) {
    logger.error('Daily report generation error', { error: error.message });
    res.status(500).json({ error: 'Failed to generate daily report' });
  }
});

router.post('/reports/suspicious-activity', authMiddleware, adminAuthMiddleware, async (req, res) => {
  try {
    const report = await cbnReporting.generateSuspiciousActivityReport();
    const submission = await cbnReporting.submitReport(report);
    
    res.json({
      success: true,
      reportId: report.reportId,
      submissionId: submission.submissionId,
      status: submission.status,
    });
  } catch (error) {
    logger.error('SAR report generation error', { error: error.message });
    res.status(500).json({ error: 'Failed to generate SAR report' });
  }
});

router.post('/reports/kyc-compliance', authMiddleware, adminAuthMiddleware, async (req, res) => {
  try {
    const report = await cbnReporting.generateKYCComplianceReport();
    const submission = await cbnReporting.submitReport(report);
    
    res.json({
      success: true,
      reportId: report.reportId,
      submissionId: submission.submissionId,
      status: submission.status,
    });
  } catch (error) {
    logger.error('KYC compliance report generation error', { error: error.message });
    res.status(500).json({ error: 'Failed to generate KYC compliance report' });
  }
});

// Compliance Dashboard Data
router.get('/dashboard', authMiddleware, adminAuthMiddleware, async (req, res) => {
  try {
    const KYC = require('../models/KYC');
    const AML = require('../models/AML');
    const Transaction = require('../models/Transaction');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [
      totalKYC,
      approvedKYC,
      pendingKYC,
      highRiskAlerts,
      todayTransactions,
      monthlyTransactions,
    ] = await Promise.all([
      KYC.countDocuments(),
      KYC.countDocuments({ status: 'approved' }),
      KYC.countDocuments({ status: 'pending' }),
      AML.countDocuments({ riskLevel: { $in: ['high', 'critical'] }, status: 'open' }),
      Transaction.countDocuments({ createdAt: { $gte: today } }),
      Transaction.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    ]);
    
    res.json({
      success: true,
      data: {
        kyc: {
          total: totalKYC,
          approved: approvedKYC,
          pending: pendingKYC,
          complianceRate: totalKYC > 0 ? (approvedKYC / totalKYC) * 100 : 0,
        },
        aml: {
          highRiskAlerts,
        },
        transactions: {
          today: todayTransactions,
          monthly: monthlyTransactions,
        },
      },
    });
  } catch (error) {
    logger.error('Compliance dashboard error', { error: error.message });
    res.status(500).json({ error: 'Failed to load compliance dashboard' });
  }
});

// Risk Assessment
router.get('/risk-assessment/:userId', authMiddleware, adminAuthMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const riskScore = await ComplianceService.calculateUserRiskScore(userId);
    const transactionHistory = await ComplianceService.analyzeTransactionHistory(userId);
    
    res.json({
      success: true,
      riskScore,
      riskLevel: riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low',
      transactionHistory,
    });
  } catch (error) {
    logger.error('Risk assessment error', { userId: req.params.userId, error: error.message });
    res.status(500).json({ error: 'Risk assessment failed' });
  }
});

module.exports = router;