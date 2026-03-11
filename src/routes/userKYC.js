const express = require('express');
const authMiddleware = require('../middleware/auth');
const { uploadDocument } = require('../middleware/uploadMiddleware');
const userKYCController = require('../controllers/userKYCController');

const router = express.Router();

// All KYC routes require authentication
router.use(authMiddleware);

/**
 * Get User KYC Details
 * GET /api/kyc/user
 */
router.get('/', userKYCController.getUserKYCDetails);

/**
 * Upload ID Document
 * POST /api/kyc/user/upload-id
 * Body: { idType, idNumber, firstName, lastName, dateOfBirth }
 * File: req.file (document image)
 */
router.post('/upload-id', uploadDocument, userKYCController.uploadIDDocument);

/**
 * Upload Selfie Document
 * POST /api/kyc/user/upload-selfie
 * File: req.file (selfie image)
 */
router.post('/upload-selfie', uploadDocument, userKYCController.uploadSelfieDocument);

/**
 * Update Address
 * POST /api/kyc/user/address
 * Body: { street, city, state, zipCode, country }
 */
router.post('/address', userKYCController.updateAddress);

/**
 * Check Transaction Eligibility
 * GET /api/kyc/user/can-transact?amount=1000000
 */
router.get('/can-transact', userKYCController.checkTransactionEligibility);

module.exports = router;
