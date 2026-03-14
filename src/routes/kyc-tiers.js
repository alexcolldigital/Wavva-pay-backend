const express = require('express');
const router = express.Router();
const kycService = require('../services/kyc-tiers');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');

// ============================================
// Tier 1 - Basic KYC Routes
// ============================================

// Get Tier 1 requirements
router.get('/tier1/requirements', auth, async (req, res) => {
  try {
    const requirements = await kycService.getTierRequirements('TIER_1');
    res.json({
      success: true,
      data: requirements
    });
  } catch (err) {
    logger.error('Get Tier 1 requirements error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Submit Tier 1 KYC
router.post('/tier1/submit', auth, async (req, res) => {
  try {
    const { phoneNumber, firstName, lastName, dateOfBirth } = req.body;

    // Validate input
    if (!phoneNumber || !firstName || !lastName || !dateOfBirth) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: phoneNumber, firstName, lastName, dateOfBirth'
      });
    }

    const result = await kycService.submitTier1(req.user.id, {
      phoneNumber,
      firstName,
      lastName,
      dateOfBirth
    });

    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    logger.error('Tier 1 submission error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Verify phone number with OTP
router.post('/tier1/verify-phone', auth, async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Missing phoneNumber or OTP'
      });
    }

    const result = await kycService.verifyTier1PhoneNumber(req.user.id, phoneNumber, otp);

    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    logger.error('Phone verification error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// Tier 2 - Medium KYC Routes
// ============================================

// Get Tier 2 requirements
router.get('/tier2/requirements', auth, async (req, res) => {
  try {
    const requirements = await kycService.getTierRequirements('TIER_2');
    res.json({
      success: true,
      data: requirements
    });
  } catch (err) {
    logger.error('Get Tier 2 requirements error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Submit Tier 2 KYC
router.post('/tier2/submit', auth, async (req, res) => {
  try {
    const { bvn, nin, address } = req.body;

    // Validate input
    if (!bvn && !nin) {
      return res.status(400).json({
        success: false,
        error: 'Either BVN or NIN is required'
      });
    }

    if (!address || !address.street || !address.city || !address.state) {
      return res.status(400).json({
        success: false,
        error: 'Complete address is required (street, city, state)'
      });
    }

    const result = await kycService.submitTier2(req.user.id, {
      bvn,
      nin,
      address
    });

    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    logger.error('Tier 2 submission error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Verify BVN
router.post('/tier2/verify-bvn', auth, async (req, res) => {
  try {
    const { bvn, firstName, lastName } = req.body;

    if (!bvn || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: 'Missing BVN, firstName, or lastName'
      });
    }

    const result = await kycService.verifyTier2BVN(req.user.id, bvn, firstName, lastName);

    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    logger.error('BVN verification error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Verify NIN
router.post('/tier2/verify-nin', auth, async (req, res) => {
  try {
    const { nin, firstName, lastName } = req.body;

    if (!nin || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: 'Missing NIN, firstName, or lastName'
      });
    }

    const result = await kycService.verifyTier2NIN(req.user.id, nin, firstName, lastName);

    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    logger.error('NIN verification error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// Tier 3 - Full KYC Routes
// ============================================

// Get Tier 3 requirements
router.get('/tier3/requirements', auth, async (req, res) => {
  try {
    const requirements = await kycService.getTierRequirements('TIER_3');
    res.json({
      success: true,
      data: requirements
    });
  } catch (err) {
    logger.error('Get Tier 3 requirements error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Submit Tier 3 KYC
router.post('/tier3/submit', auth, async (req, res) => {
  try {
    const { idType, idNumber, idDocumentUrl, selfieUrl, proofOfAddressUrl } = req.body;

    // Validate input
    if (!idType || !idNumber || !idDocumentUrl || !selfieUrl || !proofOfAddressUrl) {
      return res.status(400).json({
        success: false,
        error: 'All documents are required: idType, idNumber, idDocumentUrl, selfieUrl, proofOfAddressUrl'
      });
    }

    const validIdTypes = ['national_id', 'passport', 'drivers_license'];
    if (!validIdTypes.includes(idType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ID type. Must be one of: ${validIdTypes.join(', ')}`
      });
    }

    const result = await kycService.submitTier3(req.user.id, {
      idType,
      idNumber,
      idDocumentUrl,
      selfieUrl,
      proofOfAddressUrl
    });

    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    logger.error('Tier 3 submission error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Verify face match (liveness + face recognition)
router.post('/tier3/verify-face', auth, async (req, res) => {
  try {
    const { livenessScore, matchScore } = req.body;

    if (livenessScore === undefined || matchScore === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing livenessScore or matchScore'
      });
    }

    if (livenessScore < 0 || livenessScore > 1 || matchScore < 0 || matchScore > 1) {
      return res.status(400).json({
        success: false,
        error: 'Scores must be between 0 and 1'
      });
    }

    const result = await kycService.verifyTier3FaceMatch(
      req.user.id,
      livenessScore,
      matchScore
    );

    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    logger.error('Face verification error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// KYC Status & Information Routes
// ============================================

// Get current KYC status
router.get('/status', auth, async (req, res) => {
  try {
    const status = await kycService.getKYCStatus(req.user.id);

    res.json({
      success: true,
      data: status
    });
  } catch (err) {
    logger.error('Get KYC status error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get all tier requirements
router.get('/all-requirements', auth, async (req, res) => {
  try {
    const tier1 = await kycService.getTierRequirements('TIER_1');
    const tier2 = await kycService.getTierRequirements('TIER_2');
    const tier3 = await kycService.getTierRequirements('TIER_3');

    res.json({
      success: true,
      data: {
        tier1,
        tier2,
        tier3
      }
    });
  } catch (err) {
    logger.error('Get all requirements error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// Transaction Limits Routes
// ============================================

// Check if transaction is allowed
router.post('/check-transaction', auth, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount'
      });
    }

    const result = await kycService.checkTransactionAllowed(req.user.id, amount);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    logger.error('Check transaction error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get current transaction limits
router.get('/limits', auth, async (req, res) => {
  try {
    const status = await kycService.getKYCStatus(req.user.id);

    res.json({
      success: true,
      data: {
        currentTier: status.currentTier,
        limits: status.limits,
        transactionLimits: status.transactionLimits
      }
    });
  } catch (err) {
    logger.error('Get limits error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// Risk Profile Routes
// ============================================

// Get risk profile
router.get('/risk-profile', auth, async (req, res) => {
  try {
    const riskProfile = await kycService.getRiskProfile(req.user.id);

    res.json({
      success: true,
      data: riskProfile
    });
  } catch (err) {
    logger.error('Get risk profile error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ============================================
// Admin Routes (for verification & management)
// ============================================

// Admin: Get user KYC details (admin only)
router.get('/admin/user/:userId', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const status = await kycService.getKYCStatus(req.params.userId);

    res.json({
      success: true,
      data: status
    });
  } catch (err) {
    logger.error('Admin get user KYC error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
