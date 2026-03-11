const UserKYC = require('../models/UserKYC');
const MerchantKYC = require('../models/MerchantKYC');
const logger = require('../utils/logger');

/**
 * Auto-verification service for KYC documents
 * Implements rule-based automatic verification
 */

/**
 * Verify User KYC based on document quality and rules
 * @param {string} kycId - KYC record ID
 * @returns {object} - Verification result
 */
const autoVerifyUserKYC = async (kycId) => {
  try {
    const userKYC = await UserKYC.findById(kycId);
    if (!userKYC) {
      return { success: false, error: 'KYC record not found' };
    }

    // Auto-verification rules
    let autoVerified = false;
    let kycLevel = 1; // Default to basic after ID verification

    // Rule 1: Check if required documents are present
    const hasIDDocument = !!userKYC.idDocument;
    const hasAddress = userKYC.address?.street && userKYC.address?.city;
    const hasPersonalDetails = userKYC.firstName && userKYC.lastName && userKYC.dateOfBirth;

    // Rule 2: Check document quality (simplified - in production would use ML)
    const documentScore = calculateDocumentQuality(userKYC.idDocument);

    // Rule 3: Verify basic eligibility
    if (hasIDDocument && hasAddress && documentScore >= 70) {
      autoVerified = true;
      kycLevel = 2; // Intermediate with good document quality
    } else if (hasIDDocument && (hasAddress || hasPersonalDetails)) {
      autoVerified = true;
      kycLevel = 1; // Basic verification
    }

    if (autoVerified) {
      userKYC.status = 'approved';
      userKYC.verified = true;
      userKYC.verifiedDate = new Date();
      userKYC.kycLevel = kycLevel;

      // Set transaction limits based on KYC level
      userKYC.limits = setLimitsByKYCLevel(kycLevel);

      // Set expiry (2 years from verification)
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 2);
      userKYC.expiryDate = expiryDate;

      userKYC.submissions = userKYC.submissions || [];
      userKYC.submissions.push({
        submittedAt: new Date(),
        status: 'approved',
        comment: `Auto-verified with KYC Level ${kycLevel}`
      });

      await userKYC.save();

      logger.info(`✅ User KYC Auto-Verified: ${userKYC.userId} (Level ${kycLevel})`);

      return {
        success: true,
        verified: true,
        kycLevel,
        message: `KYC auto-verified to Level ${kycLevel}`
      };
    } else {
      // Mark for manual review if auto-verification failed
      userKYC.status = 'pending';
      userKYC.flaggedForReview = true;
      userKYC.complianceNotes = `Auto-verification failed. Document score: ${documentScore}. Missing: ${
        !hasIDDocument ? 'ID document ' : ''
      }${!hasAddress ? 'Address ' : ''}${!hasPersonalDetails ? 'Personal details' : ''}`;

      await userKYC.save();

      logger.warn(`⚠️ User KYC flagged for manual review: ${userKYC.userId}`);

      return {
        success: false,
        verified: false,
        message: 'KYC auto-verification failed. Flagged for manual review.'
      };
    }
  } catch (err) {
    logger.error('Auto-verify User KYC error:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Auto-verify Merchant KYC based on document quality and rules
 */
const autoVerifyMerchantKYC = async (kycId) => {
  try {
    const merchantKYC = await MerchantKYC.findById(kycId);
    if (!merchantKYC) {
      return { success: false, error: 'KYC record not found' };
    }

    let autoVerified = false;
    let kycLevel = 1;

    // Check all required merchant documents
    const hasBusinessReg = !!merchantKYC.businessRegistration?.document;
    const hasDirector = merchantKYC.directors && merchantKYC.directors.length > 0 && merchantKYC.directors[0].idDocument;
    const hasBankAccount = !!merchantKYC.bankAccount?.verificationDocument;

    const regScore = hasBusinessReg ? calculateDocumentQuality(merchantKYC.businessRegistration.document) : 0;
    const directorScore = hasDirector ? calculateDocumentQuality(merchantKYC.directors[0].idDocument) : 0;
    const bankScore = hasBankAccount ? calculateDocumentQuality(merchantKYC.bankAccount.verificationDocument) : 0;

    // Rule: All documents must be present and good quality
    if (hasBusinessReg && hasDirector && hasBankAccount && 
        regScore >= 70 && directorScore >= 70 && bankScore >= 70) {
      autoVerified = true;
      kycLevel = 2; // Intermediate merchant
    } else if (hasBusinessReg && hasDirector && regScore >= 70 && directorScore >= 70) {
      autoVerified = true;
      kycLevel = 1; // Basic merchant (without bank account verification)
    }

    if (autoVerified) {
      merchantKYC.status = 'approved';
      merchantKYC.verified = true;
      merchantKYC.verifiedDate = new Date();
      merchantKYC.kycLevel = kycLevel;

      // Set expiry
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 2);
      merchantKYC.expiryDate = expiryDate;

      merchantKYC.submissions = merchantKYC.submissions || [];
      merchantKYC.submissions.push({
        submittedAt: new Date(),
        status: 'approved',
        comment: `Auto-verified with KYC Level ${kycLevel}`
      });

      await merchantKYC.save();

      logger.info(`✅ Merchant KYC Auto-Verified: ${merchantKYC.merchantId} (Level ${kycLevel})`);

      return {
        success: true,
        verified: true,
        kycLevel,
        message: `Merchant KYC auto-verified to Level ${kycLevel}`
      };
    } else {
      merchantKYC.status = 'pending';
      merchantKYC.flaggedForReview = true;

      const missing = [];
      if (!hasBusinessReg) missing.push('Business registration');
      if (!hasDirector) missing.push('Director ID');
      if (!hasBankAccount) missing.push('Bank account verification');

      merchantKYC.complianceNotes = `Auto-verification failed. Scores: Reg=${regScore}, Director=${directorScore}, Bank=${bankScore}. Missing: ${missing.join(', ')}`;

      await merchantKYC.save();

      logger.warn(`⚠️ Merchant KYC flagged for manual review: ${merchantKYC.merchantId}`);

      return {
        success: false,
        verified: false,
        message: 'Merchant KYC auto-verification failed. Flagged for manual review.'
      };
    }
  } catch (err) {
    logger.error('Auto-verify Merchant KYC error:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Calculate document quality score (simplified)
 * In production, would use ML/OCR to verify document authenticity
 */
const calculateDocumentQuality = (documentUrl) => {
  // Simplified scoring - in production would use:
  // - ML-based document detection
  // - OCR for text extraction
  // - Liveness detection
  // - Security feature detection
  
  if (!documentUrl) return 0;

  // Basic checks
  let score = 50; // Base score

  // Check URL validity
  if (documentUrl.includes('cloudinary') || documentUrl.includes('secure_url')) {
    score += 20;
  }

  // Assume uploaded documents pass basic quality (in production, use ML)
  score += 30;

  return Math.min(score, 100);
};

/**
 * Set transaction limits based on KYC level
 */
const setLimitsByKYCLevel = (kycLevel) => {
  const limitsByLevel = {
    0: { // Unverified
      dailyLimit: 500000, // ₦5,000
      monthlyLimit: 5000000, // ₦50,000
      singleTransactionLimit: 1000000 // ₦10,000
    },
    1: { // Basic
      dailyLimit: 5000000, // ₦50,000
      monthlyLimit: 50000000, // ₦500,000
      singleTransactionLimit: 5000000 // ₦50,000
    },
    2: { // Intermediate
      dailyLimit: 25000000, // ₦250,000
      monthlyLimit: 250000000, // ₦2,500,000
      singleTransactionLimit: 25000000 // ₦250,000
    },
    3: { // Full
      dailyLimit: 100000000, // ₦1,000,000
      monthlyLimit: 1000000000, // ₦10,000,000
      singleTransactionLimit: 100000000 // ₦1,000,000
    }
  };

  return limitsByLevel[kycLevel] || limitsByLevel[0];
};

/**
 * Check if KYC requires reverification (expired)
 */
const checkKYCExpiry = async (userId) => {
  try {
    const userKYC = await UserKYC.findOne({ userId });
    if (!userKYC) return false;

    if (userKYC.expiryDate && new Date() > userKYC.expiryDate) {
      userKYC.requiresReverification = true;
      userKYC.status = 'expired';
      await userKYC.save();
      return true;
    }

    return false;
  } catch (err) {
    logger.error('Check KYC expiry error:', err.message);
    return false;
  }
};

/**
 * Bulk auto-verify pending KYC documents
 * Useful for batch processing
 */
const bulkAutoVerifyPending = async (limit = 100) => {
  try {
    const pendingKYCs = await UserKYC.find({
      status: 'pending',
      idDocument: { $exists: true, $ne: null }
    }).limit(limit);

    let verifiedCount = 0;
    let failedCount = 0;

    for (const kyc of pendingKYCs) {
      const result = await autoVerifyUserKYC(kyc._id);
      if (result.success && result.verified) {
        verifiedCount++;
      } else {
        failedCount++;
      }
    }

    logger.info(`Bulk auto-verification completed: ${verifiedCount} verified, ${failedCount} flagged for review`);

    return {
      success: true,
      verifiedCount,
      failedCount,
      total: pendingKYCs.length
    };
  } catch (err) {
    logger.error('Bulk auto-verify error:', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = {
  autoVerifyUserKYC,
  autoVerifyMerchantKYC,
  calculateDocumentQuality,
  setLimitsByKYCLevel,
  checkKYCExpiry,
  bulkAutoVerifyPending
};
