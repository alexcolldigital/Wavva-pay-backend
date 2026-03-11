const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const router = express.Router();

// Admin verification middleware
const adminMiddleware = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.userId);
    
    // Check if user is admin (add isAdmin field to User model)
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (err) {
    res.status(403).json({ error: 'Unauthorized' });
  }
};

// Platform statistics routes
router.get('/stats', authMiddleware, adminMiddleware, adminController.getStats);

// User management routes
router.get('/users', authMiddleware, adminMiddleware, adminController.getUsers);
router.post('/users/:userId/suspend', authMiddleware, adminMiddleware, adminController.suspendUser);
router.post('/users/:userId/unsuspend', authMiddleware, adminMiddleware, adminController.unsuspendUser);

// Transaction management routes
router.get('/transactions', authMiddleware, adminMiddleware, adminController.getTransactions);
router.get('/transactions/analytics', authMiddleware, adminMiddleware, adminController.getTransactionAnalytics);
router.post('/transactions/:transactionId/refund', authMiddleware, adminMiddleware, adminController.refundTransaction);

// Security/Monitoring routes
router.get('/fraud-alerts', authMiddleware, adminMiddleware, adminController.getFraudAlerts);

// KYC Management routes
router.get('/kyc/pending', authMiddleware, adminMiddleware, adminController.getPendingKYC);
router.get('/kyc/:kycId', authMiddleware, adminMiddleware, adminController.getKYCDetailsAdmin);
router.post('/kyc/:kycId/approve', authMiddleware, adminMiddleware, adminController.approveMerchantKYC);
router.post('/kyc/:kycId/reject', authMiddleware, adminMiddleware, adminController.rejectMerchantKYC);
router.post('/kyc/:kycId/verify-document', authMiddleware, adminMiddleware, adminController.verifyKYCDocument);

// User KYC Management routes
router.get('/kyc/user/pending', authMiddleware, adminMiddleware, adminController.getPendingUserKYC);
router.get('/kyc/user/:kycId', authMiddleware, adminMiddleware, adminController.getUserKYCDetailsAdmin);
router.post('/kyc/user/:kycId/auto-verify', authMiddleware, adminMiddleware, adminController.autoVerifyUserKYCEndpoint);
router.post('/kyc/user/:kycId/approve', authMiddleware, adminMiddleware, adminController.approveUserKYC);
router.post('/kyc/user/:kycId/reject', authMiddleware, adminMiddleware, adminController.rejectUserKYC);
router.post('/kyc/user/bulk-verify', authMiddleware, adminMiddleware, adminController.bulkAutoVerifyUserKYC);

// Internal Ledger Management routes
/**
 * Internal Commission Ledger Endpoints (Admin Only)
 * These endpoints provide access to platform commission tracking
 */

// Get current ledger balance
router.get('/ledger/balance', authMiddleware, adminMiddleware, adminController.getLedgerBalance);

// Get commission statistics for a period
router.get('/ledger/stats', authMiddleware, adminMiddleware, adminController.getCommissionStats);

// Get ledger entries with pagination
router.get('/ledger/entries', authMiddleware, adminMiddleware, adminController.getLedgerEntries);

// Get ledger summary (balance + monthly/all-time totals)
router.get('/ledger/summary', authMiddleware, adminMiddleware, adminController.getLedgerSummary);

// Get detailed commission breakdown report
router.get('/ledger/report', authMiddleware, adminMiddleware, adminController.getCommissionReport);

module.exports = router;
