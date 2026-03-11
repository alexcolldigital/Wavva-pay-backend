const User = require('../models/User');
const UserKYC = require('../models/UserKYC');
const cloudinaryService = require('../services/cloudinary');
const logger = require('../utils/logger');

/**
 * Get User KYC Details
 * GET /api/kyc/user
 */
const getUserKYCDetails = async (req, res) => {
  try {
    const userId = req.userId;

    let userKYC = await UserKYC.findOne({ userId });

    if (!userKYC) {
      // Create new KYC record if doesn't exist
      userKYC = new UserKYC({ userId });
      await userKYC.save();
    }

    res.json({
      success: true,
      kyc: {
        _id: userKYC._id,
        status: userKYC.status,
        verified: userKYC.verified,
        kycLevel: userKYC.kycLevel,
        idType: userKYC.idType,
        idNumber: userKYC.idNumber ? userKYC.idNumber.slice(-4).padStart(userKYC.idNumber.length, '*') : null,
        documentUploaded: !!userKYC.idDocument,
        selfieUploaded: !!userKYC.selfieDocument,
        address: userKYC.address,
        limits: userKYC.limits,
        rejectionReason: userKYC.rejectionReason,
        resubmissionCount: userKYC.resubmissionCount,
        maxResubmissions: userKYC.maxResubmissions,
        submissions: userKYC.submissions || [],
        createdAt: userKYC.createdAt,
        requiresReverification: userKYC.requiresReverification
      }
    });
  } catch (err) {
    logger.error('Get user KYC error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve KYC details' });
  }
};

/**
 * Upload ID Document
 * POST /api/kyc/user/upload-id
 */
const uploadIDDocument = async (req, res) => {
  try {
    const userId = req.userId;
    const { idType, idNumber, firstName, lastName, dateOfBirth } = req.body;

    // Validate required fields
    if (!idType || !idNumber) {
      return res.status(400).json({
        error: 'ID type and number are required'
      });
    }

    if (!['passport', 'driver_license', 'nin', 'voter_card', 'national_id'].includes(idType)) {
      return res.status(400).json({
        error: 'Invalid ID type'
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No document file uploaded' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let userKYC = await UserKYC.findOne({ userId });
    if (!userKYC) {
      userKYC = new UserKYC({ userId });
    }

    // Check resubmission limit
    if (userKYC.resubmissionCount >= userKYC.maxResubmissions && userKYC.status === 'rejected') {
      return res.status(400).json({
        error: `Maximum resubmission limit (${userKYC.maxResubmissions}) reached. Please contact support.`
      });
    }

    // Delete old document if exists
    if (userKYC.idDocumentPublicId) {
      try {
        await cloudinaryService.deleteFile(userKYC.idDocumentPublicId);
      } catch (err) {
        logger.warn('Error deleting old KYC document:', err.message);
      }
    }

    // Upload new document
    const uploadResult = await cloudinaryService.uploadDocument(
      req.file.buffer,
      userId,
      `kyc_id_${idType}_${Date.now()}`
    );

    userKYC.idType = idType;
    userKYC.idNumber = idNumber;
    userKYC.idDocument = uploadResult.secure_url;
    userKYC.idDocumentPublicId = uploadResult.public_id;
    userKYC.firstName = firstName || user.firstName;
    userKYC.lastName = lastName || user.lastName;
    userKYC.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;

    // Reset status for resubmission
    if (userKYC.status === 'rejected') {
      userKYC.status = 'pending';
      userKYC.resubmissionCount += 1;
      userKYC.rejectionReason = null;
      userKYC.rejectionDate = null;
    }

    // Add submission record
    userKYC.submissions = userKYC.submissions || [];
    userKYC.submissions.push({
      submittedAt: new Date(),
      status: 'pending',
      comment: `ID document (${idType}) uploaded`
    });

    await userKYC.save();

    logger.info(`User KYC ID document uploaded: ${userId} (${idType})`);

    res.json({
      success: true,
      message: 'ID document uploaded successfully. Awaiting verification.',
      kyc: {
        _id: userKYC._id,
        status: userKYC.status,
        verified: userKYC.verified,
        kycLevel: userKYC.kycLevel,
        documentUploaded: true
      }
    });
  } catch (err) {
    logger.error('Upload ID document error:', err.message);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

/**
 * Upload Selfie/Liveness Document
 * POST /api/kyc/user/upload-selfie
 */
const uploadSelfieDocument = async (req, res) => {
  try {
    const userId = req.userId;

    if (!req.file) {
      return res.status(400).json({ error: 'No selfie file uploaded' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let userKYC = await UserKYC.findOne({ userId });
    if (!userKYC) {
      userKYC = new UserKYC({ userId });
    }

    // Delete old selfie if exists
    if (userKYC.selfieDocumentPublicId) {
      try {
        await cloudinaryService.deleteFile(userKYC.selfieDocumentPublicId);
      } catch (err) {
        logger.warn('Error deleting old selfie:', err.message);
      }
    }

    // Upload new selfie
    const uploadResult = await cloudinaryService.uploadDocument(
      req.file.buffer,
      userId,
      `kyc_selfie_${Date.now()}`
    );

    userKYC.selfieDocument = uploadResult.secure_url;
    userKYC.selfieDocumentPublicId = uploadResult.public_id;

    // Add submission record
    userKYC.submissions = userKYC.submissions || [];
    userKYC.submissions.push({
      submittedAt: new Date(),
      status: 'pending',
      comment: 'Selfie document uploaded'
    });

    await userKYC.save();

    logger.info(`User KYC selfie uploaded: ${userId}`);

    res.json({
      success: true,
      message: 'Selfie uploaded successfully.',
      kyc: {
        _id: userKYC._id,
        selfieUploaded: true,
        status: userKYC.status
      }
    });
  } catch (err) {
    logger.error('Upload selfie error:', err.message);
    res.status(500).json({ error: 'Failed to upload selfie' });
  }
};

/**
 * Update Address
 * POST /api/kyc/user/address
 */
const updateAddress = async (req, res) => {
  try {
    const userId = req.userId;
    const { street, city, state, zipCode, country } = req.body;

    if (!street || !city || !state) {
      return res.status(400).json({
        error: 'Street, city, and state are required'
      });
    }

    let userKYC = await UserKYC.findOne({ userId });
    if (!userKYC) {
      userKYC = new UserKYC({ userId });
    }

    userKYC.address = {
      street,
      city,
      state,
      zipCode: zipCode || '',
      country: country || 'Nigeria'
    };

    await userKYC.save();

    res.json({
      success: true,
      message: 'Address updated successfully',
      address: userKYC.address
    });
  } catch (err) {
    logger.error('Update address error:', err.message);
    res.status(500).json({ error: 'Failed to update address' });
  }
};

/**
 * Check if user can perform high-value transactions
 * GET /api/kyc/user/can-transact?amount=1000000
 */
const checkTransactionEligibility = async (req, res) => {
  try {
    const userId = req.userId;
    const { amount } = req.query;

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: 'Amount is required and must be a number' });
    }

    const userKYC = await UserKYC.findOne({ userId });

    // Default limits for unverified users (KYC Level 0)
    const limits = userKYC?.limits || {
      dailyLimit: 500000,
      monthlyLimit: 5000000,
      singleTransactionLimit: 1000000
    };

    const user = await User.findById(userId).populate('walletId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const amountInCents = Math.round(amount * 100);

    // Check transaction limits
    const eligible = amountInCents <= limits.singleTransactionLimit;

    res.json({
      success: true,
      eligible,
      amount: parseInt(amount),
      limits: {
        singleTransactionLimit: limits.singleTransactionLimit / 100,
        dailyLimit: limits.dailyLimit / 100,
        monthlyLimit: limits.monthlyLimit / 100
      },
      kycLevel: userKYC?.kycLevel || 0,
      verified: userKYC?.verified || false,
      message: !eligible ? `Amount exceeds maximum transaction limit (₦${limits.singleTransactionLimit / 100})` : 'Transaction eligible'
    });
  } catch (err) {
    logger.error('Check transaction eligibility error:', err.message);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
};

module.exports = {
  getUserKYCDetails,
  uploadIDDocument,
  uploadSelfieDocument,
  updateAddress,
  checkTransactionEligibility
};
