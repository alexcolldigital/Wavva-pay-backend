const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const bankingController = require('../controllers/bankingController');
const {
  transactionMiddleware,
  validateBankingPayload,
  bankingRateLimiter,
  biometricRateLimiter,
} = require('../middleware/bankingMiddleware');

/**
 * Banking Routes - Hands-free banking via voice commands
 * All routes require authentication
 */

// Rate limiting middleware
router.use(bankingRateLimiter);

// Session Management Routes

/**
 * Initialize banking session
 * POST /api/banking/session/start
 * @body {string} featureType - Type of banking feature (VOICE_BANKING, HANDS_FREE_TRANSACTION)
 * @body {string} device - Device type
 * @body {string} platform - Platform (WEB, ANDROID, IOS)
 */
router.post(
  '/session/start',
  authMiddleware,
  validateBankingPayload('session'),
  bankingController.startBankingSession
);

/**
 * End banking session
 * POST /api/banking/session/end
 * @body {string} sessionId - Session ID to end
 * @body {string} reason - Reason for ending session
 */
router.post(
  '/session/end',
  authMiddleware,
  bankingController.endBankingSession
);

/**
 * Get banking session details
 * GET /api/banking/session/:sessionId
 */
router.get(
  '/session/:sessionId',
  authMiddleware,
  bankingController.getSessionDetails
);

/**
 * Get user's banking sessions
 * GET /api/banking/sessions?status=ACTIVE&page=1&limit=20
 */
router.get(
  '/sessions',
  authMiddleware,
  bankingController.getUserSessions
);

// Command Processing Routes

/**
 * Process voice command for banking
 * POST /api/banking/command/process
 * @body {string} sessionId - Active banking session ID
 * @body {string} command - Voice command text (e.g., "Send 1000 to John")
 */
router.post(
  '/command/process',
  authMiddleware,
  validateBankingPayload('command'),
  transactionMiddleware,
  bankingController.processVoiceCommand
);

// Biometric Verification Routes

/**
 * Initiate biometric verification for transaction
 * POST /api/banking/verify/biometric/initiate
 * @body {string} transactionId - Transaction to verify
 * @body {string} sessionId - Banking session ID
 * @body {string} preferredMethod - Preferred biometric method (FINGERPRINT, FACE_RECOGNITION, PIN, OTP)
 */
router.post(
  '/verify/biometric/initiate',
  authMiddleware,
  validateBankingPayload('biometric_initiate'),
  bankingController.initiateBiometricVerification
);

/**
 * Verify biometric input
 * POST /api/banking/verify/biometric/confirm
 * @body {string} verificationSessionId - Biometric verification session ID
 * @body {object} biometricData - Biometric data (fingerprint, face image, PIN, OTP, etc.)
 * @body {string} transactionId - Associated transaction ID
 */
router.post(
  '/verify/biometric/confirm',
  authMiddleware,
  validateBankingPayload('biometric_confirm'),
  biometricRateLimiter,
  bankingController.verifyBiometric
);

// Transaction Execution Routes

/**
 * Execute confirmed transaction
 * POST /api/banking/transaction/execute
 * @body {string} transactionId - Transaction to execute
 * @body {string} sessionId - Banking session ID
 */
router.post(
  '/transaction/execute',
  authMiddleware,
  validateBankingPayload('transaction_execute'),
  transactionMiddleware,
  bankingController.executeTransaction
);

/**
 * Cancel pending or initiated transaction
 * POST /api/banking/transaction/cancel
 * @body {string} transactionId - Transaction to cancel
 * @body {string} reason - Reason for cancellation
 */
router.post(
  '/transaction/cancel',
  authMiddleware,
  validateBankingPayload('transaction_cancel'),
  bankingController.cancelTransaction
);

/**
 * Get transaction status and progress
 * GET /api/banking/transaction/:transactionId
 */
router.get(
  '/transaction/:transactionId',
  authMiddleware,
  bankingController.getTransactionStatus
);

// Health Check

/**
 * Health check endpoint
 * GET /api/banking/health
 */
router.get('/health', bankingController.healthCheck);

/**
 * Error handling for banking routes
 */
router.use((err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.message,
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized access',
    });
  }

  console.error('Banking route error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

module.exports = router;
