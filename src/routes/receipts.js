const express = require('express');
const authMiddleware = require('../middleware/auth');
const {
  downloadTransactionReceipt,
  getReceiptDetails,
  downloadBillPaymentReceipt,
  resendTransactionReceipt,
  getTransactionAlertPreferences,
  updateTransactionAlertPreferences,
} = require('../controllers/receiptsController');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Transaction receipt routes
router.get('/transactions/:transactionId/details', getReceiptDetails);
router.get('/transactions/:transactionId/download/:format', downloadTransactionReceipt);
router.post('/transactions/:transactionId/resend', resendTransactionReceipt);

// Bill payment receipt routes
router.get('/bill-payments/:billPaymentId/download/:format', downloadBillPaymentReceipt);

// Transaction alert preferences
router.get('/alerts/preferences', getTransactionAlertPreferences);
router.put('/alerts/preferences', updateTransactionAlertPreferences);

module.exports = router;
