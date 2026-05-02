const express = require('express');
const multer = require('multer');
const ComplianceService = require('../services/compliance');
const KYC = require('../models/KYC');
const { authMiddleware, kycRequiredMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');
const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/**
 * @swagger
 * /kyc/submit:
 *   post:
 *     tags:
 *       - KYC
 *     summary: Submit KYC documents
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               nationality:
 *                 type: string
 *               street:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               country:
 *                 type: string
 *               postalCode:
 *                 type: string
 *               occupation:
 *                 type: string
 *               sourceOfIncome:
 *                 type: string
 *                 enum: [employment, business, investment, other]
 *               idType:
 *                 type: string
 *                 enum: [passport, drivers_license, national_id, voters_card]
 *               idNumber:
 *                 type: string
 *               idExpiryDate:
 *                 type: string
 *                 format: date
 *               idFrontImage:
 *                 type: string
 *                 format: binary
 *               idBackImage:
 *                 type: string
 *                 format: binary
 *               selfieImage:
 *                 type: string
 *                 format: binary
 *               proofOfAddress:
 *                 type: string
 *                 format: binary
 */
router.post('/submit', authMiddleware, upload.fields([
  { name: 'idFrontImage', maxCount: 1 },
  { name: 'idBackImage', maxCount: 1 },
  { name: 'selfieImage', maxCount: 1 },
  { name: 'proofOfAddress', maxCount: 1 }
]), async (req, res) => {
  try {
    const userId = req.user.id;
    const files = req.files;
    
    // Validate required fields
    const requiredFields = [
      'dateOfBirth', 'nationality', 'street', 'city', 'state', 
      'country', 'postalCode', 'occupation', 'sourceOfIncome',
      'idType', 'idNumber', 'idExpiryDate'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        missingFields
      });
    }
    
    // Validate required files
    if (!files.idFrontImage || !files.selfieImage || !files.proofOfAddress) {
      return res.status(400).json({
        success: false,
        error: 'Required documents missing',
        required: ['idFrontImage', 'selfieImage', 'proofOfAddress']
      });
    }
    
    // In production, upload files to Cloudinary or S3
    const kycData = {
      personalInfo: {
        dateOfBirth: new Date(req.body.dateOfBirth),
        nationality: req.body.nationality,
        address: {
          street: req.body.street,
          city: req.body.city,
          state: req.body.state,
          country: req.body.country,
          postalCode: req.body.postalCode
        },
        occupation: req.body.occupation,
        sourceOfIncome: req.body.sourceOfIncome
      },
      documents: {
        idType: req.body.idType,
        idNumber: req.body.idNumber,
        idExpiryDate: new Date(req.body.idExpiryDate),
        idFrontImage: `uploads/${files.idFrontImage[0].filename}`, // Replace with cloud URL
        idBackImage: files.idBackImage ? `uploads/${files.idBackImage[0].filename}` : null,
        selfieImage: `uploads/${files.selfieImage[0].filename}`,
        proofOfAddress: `uploads/${files.proofOfAddress[0].filename}`
      }
    };
    
    const kyc = await ComplianceService.submitKYC(userId, kycData);
    
    res.status(201).json({
      success: true,
      message: 'KYC documents submitted successfully',
      kyc: {
        id: kyc._id,
        status: kyc.status,
        submittedAt: kyc.verificationDetails.submittedAt
      }
    });
    
  } catch (error) {
    logger.error('KYC submission failed', { userId: req.user?.id, error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /kyc/status:
 *   get:
 *     tags:
 *       - KYC
 *     summary: Get KYC status
 *     security:
 *       - bearerAuth: []
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const kyc = await KYC.findOne({ userId }).select('-documents');
    
    if (!kyc) {
      return res.json({
        success: true,
        status: 'not_submitted',
        message: 'KYC not yet submitted'
      });
    }
    
    res.json({
      success: true,
      kyc: {
        status: kyc.status,
        riskLevel: kyc.riskLevel,
        submittedAt: kyc.verificationDetails.submittedAt,
        reviewedAt: kyc.verificationDetails.reviewedAt,
        expiryDate: kyc.verificationDetails.expiryDate,
        rejectionReason: kyc.verificationDetails.rejectionReason,
        transactionLimits: kyc.transactionLimits
      }
    });
    
  } catch (error) {
    logger.error('KYC status check failed', { userId: req.user?.id, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve KYC status'
    });
  }
});

/**
 * @swagger
 * /kyc/review:
 *   post:
 *     tags:
 *       - KYC Admin
 *     summary: Review KYC submission (Admin only)
 *     security:
 *       - bearerAuth: []
 */
router.post('/review', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
    const { kycId, decision, rejectionReason } = req.body;
    
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid decision. Must be approved or rejected'
      });
    }
    
    if (decision === 'rejected' && !rejectionReason) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason required'
      });
    }
    
    const kyc = await ComplianceService.reviewKYC(kycId, req.user.id, decision, rejectionReason);
    
    res.json({
      success: true,
      message: `KYC ${decision} successfully`,
      kyc: {
        id: kyc._id,
        status: kyc.status,
        reviewedAt: kyc.verificationDetails.reviewedAt
      }
    });
    
  } catch (error) {
    logger.error('KYC review failed', { reviewerId: req.user?.id, error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /kyc/pending:
 *   get:
 *     tags:
 *       - KYC Admin
 *     summary: Get pending KYC submissions (Admin only)
 *     security:
 *       - bearerAuth: []
 */
router.get('/pending', authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const pendingKYCs = await KYC.find({ 
      status: { $in: ['pending', 'under_review'] } 
    })
    .populate('userId', 'firstName lastName email')
    .select('-documents') // Don't send document URLs in list
    .sort({ 'verificationDetails.submittedAt': -1 })
    .skip(skip)
    .limit(limit);
    
    const total = await KYC.countDocuments({ 
      status: { $in: ['pending', 'under_review'] } 
    });
    
    res.json({
      success: true,
      kycs: pendingKYCs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error('Pending KYC fetch failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending KYCs'
    });
  }
});

module.exports = router;