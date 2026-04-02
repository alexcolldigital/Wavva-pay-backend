const mongoose = require('mongoose');
const logger = require('../utils/logger');

// ============================================
// KYC Tier Schema
// ============================================

const kycTierSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  currentTier: {
    type: String,
    enum: ['TIER_0', 'TIER_1', 'TIER_2', 'TIER_3'],
    default: 'TIER_0'
  },
  
  // Tier 1 (Basic KYC)
  tier1: {
    phoneNumber: {
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date
    },
    firstName: String,
    lastName: String,
    dateOfBirth: Date,
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    completedAt: Date,
    rejectionReason: String
  },

  // Tier 2 (Medium KYC)
  tier2: {
    bvn: {
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date
    },
    nin: {
      value: String,
      verified: { type: Boolean, default: false },
      verifiedAt: Date
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    completedAt: Date,
    rejectionReason: String
  },

  // Tier 3 (Full KYC)
  tier3: {
    idType: {
      type: String,
      enum: ['national_id', 'passport', 'drivers_license'],
      default: 'national_id'
    },
    idNumber: String,
    idDocument: {
      url: String,
      uploadedAt: Date,
      verified: { type: Boolean, default: false }
    },
    selfie: {
      url: String,
      uploadedAt: Date,
      verified: { type: Boolean, default: false },
      livenessScore: Number
    },
    proofOfAddress: {
      url: String,
      uploadedAt: Date,
      verified: { type: Boolean, default: false }
    },
    faceVerification: {
      status: {
        type: String,
        enum: ['pending', 'verified', 'failed'],
        default: 'pending'
      },
      matchScore: Number,
      verifiedAt: Date
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    completedAt: Date,
    rejectionReason: String
  },

  // Transaction Limits
  transactionLimits: {
    dailyLimit: {
      type: Number,
      default: 0
    },
    monthlyLimit: {
      type: Number,
      default: 0
    },
    walletBalanceLimit: {
      type: Number,
      default: 0
    },
    singleTransactionLimit: {
      type: Number,
      default: 0
    },
    dailyUsed: {
      type: Number,
      default: 0,
      get: function() {
        // Reset daily usage at midnight
        if (this._lastDailyReset) {
          const now = new Date();
          const lastReset = new Date(this._lastDailyReset);
          if (now.toDateString() !== lastReset.toDateString()) {
            this.dailyUsed = 0;
            this._lastDailyReset = now;
          }
        }
        return this.dailyUsed;
      }
    },
    monthlyUsed: {
      type: Number,
      default: 0
    },
    _lastDailyReset: Date,
    _lastMonthlyReset: Date
  },

  // Compliance & Risk
  riskProfile: {
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low'
    },
    flaggedTransactions: [
      {
        transactionId: String,
        reason: String,
        flaggedAt: Date
      }
    ],
    suspiciousActivity: {
      type: Boolean,
      default: false
    },
    lastReviewedAt: Date
  },

  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: Date // KYC expiration date
}, { timestamps: true });

// ============================================
// KYC Tier Limits Configuration
// ============================================

const TIER_LIMITS = {
  TIER_0: {
    name: 'Unverified',
    dailyLimit: 0,
    monthlyLimit: 0,
    walletBalanceLimit: 0,
    singleTransactionLimit: 0,
    description: 'No transactions allowed'
  },
  TIER_1: {
    name: 'Basic KYC',
    dailyLimit: 50000, // ₦50,000
    monthlyLimit: 200000, // ₦200,000
    walletBalanceLimit: 200000, // ₦200,000
    singleTransactionLimit: 25000, // ₦25,000
    description: 'Phone + Email, limited wallet access'
  },
  TIER_2: {
    name: 'Medium KYC',
    dailyLimit: 2000000, // ₦2,000,000
    monthlyLimit: 20000000, // ₦20,000,000
    walletBalanceLimit: 20000000, // ₦20,000,000
    singleTransactionLimit: 1000000, // ₦1,000,000
    description: 'BVN (via Flutterwave or Alat) OR NIN, address'
  },
  TIER_3: {
    name: 'Full KYC',
    dailyLimit: 0, // 0 means unlimited by business rule
    monthlyLimit: 0,
    walletBalanceLimit: 0,
    singleTransactionLimit: 0,
    description: 'NIN + Face verification (Wema), unlimited transactions'
  }
};

// ============================================
// KYC Service
// ============================================

class KYCService {
  constructor() {
    this.KYCTier = mongoose.model('KYCTier', kycTierSchema);
  }

  // ============================================
  // Tier 1 - Basic KYC
  // ============================================

  async submitTier1(userId, data) {
    try {
      const { phoneNumber, email, firstName, lastName, dateOfBirth } = data;

      // Validate required fields
      if (!phoneNumber || !email || !firstName || !lastName || !dateOfBirth) {
        throw new Error('Missing required fields for Tier 1 (phone, email, firstName, lastName, dateOfBirth)');
      }

      let kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier) {
        kycTier = new this.KYCTier({ userId });
      }

      // Update Tier 1 data
      kycTier.tier1 = {
        phoneNumber: {
          value: phoneNumber,
          verified: false
        },
        email,
        firstName,
        lastName,
        dateOfBirth: new Date(dateOfBirth),
        status: 'pending'
      };

      await kycTier.save();

      logger.info(`Tier 1 KYC submitted for user ${userId}`);

      return {
        success: true,
        message: 'Tier 1 KYC submitted for verification',
        tier: 'TIER_1',
        status: 'pending'
      };
    } catch (err) {
      logger.error('Tier 1 submission error:', err.message);
      throw err;
    }
  }

  async verifyTier1PhoneNumber(userId, phoneNumber, otp) {
    try {
      const kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier || !kycTier.tier1) {
        throw new Error('Tier 1 KYC not found');
      }

      // Verify OTP (implement your OTP verification logic)
      const isValidOTP = await this.verifyOTP(phoneNumber, otp);

      if (!isValidOTP) {
        throw new Error('Invalid OTP');
      }

      kycTier.tier1.phoneNumber.verified = true;
      kycTier.tier1.phoneNumber.verifiedAt = new Date();

      // Check if all Tier 1 requirements are met
      if (this.isTier1Complete(kycTier)) {
        kycTier.tier1.status = 'verified';
        kycTier.tier1.completedAt = new Date();
        kycTier.currentTier = 'TIER_1';

        // Update transaction limits
        this.updateTransactionLimits(kycTier, 'TIER_1');
      }

      await kycTier.save();

      logger.info(`Phone number verified for user ${userId}`);

      return {
        success: true,
        message: 'Phone number verified',
        tier1Status: kycTier.tier1.status,
        currentTier: kycTier.currentTier
      };
    } catch (err) {
      logger.error('Phone verification error:', err.message);
      throw err;
    }
  }

  isTier1Complete(kycTier) {
    return (
      kycTier.tier1.phoneNumber?.verified &&
      kycTier.tier1.email &&
      kycTier.tier1.firstName &&
      kycTier.tier1.lastName &&
      kycTier.tier1.dateOfBirth
    );
  }

  // ============================================
  // Tier 2 - Medium KYC
  // ============================================

  async submitTier2(userId, data) {
    try {
      const { bvn, nin, address } = data;

      // Verify Tier 1 is completed
      const kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier || kycTier.tier1.status !== 'verified') {
        throw new Error('Tier 1 KYC must be completed first');
      }

      // Validate required fields
      if (!bvn && !nin) {
        throw new Error('Either BVN or NIN is required');
      }

      if (!address || !address.street || !address.city || !address.state) {
        throw new Error('Complete address is required');
      }

      kycTier.tier2 = {
        bvn: bvn ? { value: bvn, verified: false } : undefined,
        nin: nin ? { value: nin, verified: false } : undefined,
        address,
        status: 'pending'
      };

      await kycTier.save();

      logger.info(`Tier 2 KYC submitted for user ${userId}`);

      return {
        success: true,
        message: 'Tier 2 KYC submitted for verification',
        tier: 'TIER_2',
        status: 'pending'
      };
    } catch (err) {
      logger.error('Tier 2 submission error:', err.message);
      throw err;
    }
  }

  async verifyTier2BVN(userId, bvn, firstName, lastName) {
    try {
      const kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier || !kycTier.tier2) {
        throw new Error('Tier 2 KYC not found');
      }

      // Call Wema Bank BVN verification
      const wemaService = require('./wema-realtime');
      const bvnResult = await wemaService.verifyBVN(bvn, firstName, lastName);

      if (!bvnResult.success) {
        throw new Error('BVN verification failed: ' + bvnResult.error);
      }

      kycTier.tier2.bvn.verified = true;
      kycTier.tier2.bvn.verifiedAt = new Date();

      // Check if all Tier 2 requirements are met
      if (this.isTier2Complete(kycTier)) {
        kycTier.tier2.status = 'verified';
        kycTier.tier2.completedAt = new Date();
        kycTier.currentTier = 'TIER_2';

        // Update transaction limits
        this.updateTransactionLimits(kycTier, 'TIER_2');
      }

      await kycTier.save();

      logger.info(`BVN verified for user ${userId}`);

      return {
        success: true,
        message: 'BVN verified successfully',
        tier: bvnResult.tier,
        tier2Status: kycTier.tier2.status,
        currentTier: kycTier.currentTier
      };
    } catch (err) {
      logger.error('BVN verification error:', err.message);
      throw err;
    }
  }

  async verifyTier2NIN(userId, nin, firstName, lastName) {
    try {
      const kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier || !kycTier.tier2) {
        throw new Error('Tier 2 KYC not found');
      }

      // Call Wema Bank NIN verification
      const wemaService = require('./wema-realtime');
      const ninResult = await wemaService.verifyNIN(nin, firstName, lastName);

      if (!ninResult.success) {
        throw new Error('NIN verification failed: ' + ninResult.error);
      }

      kycTier.tier2.nin.verified = true;
      kycTier.tier2.nin.verifiedAt = new Date();

      // Check if all Tier 2 requirements are met
      if (this.isTier2Complete(kycTier)) {
        kycTier.tier2.status = 'verified';
        kycTier.tier2.completedAt = new Date();
        kycTier.currentTier = 'TIER_2';

        // Update transaction limits
        this.updateTransactionLimits(kycTier, 'TIER_2');
      }

      await kycTier.save();

      logger.info(`NIN verified for user ${userId}`);

      return {
        success: true,
        message: 'NIN verified successfully',
        tier: ninResult.tier,
        tier2Status: kycTier.tier2.status,
        currentTier: kycTier.currentTier
      };
    } catch (err) {
      logger.error('NIN verification error:', err.message);
      throw err;
    }
  }

  isTier2Complete(kycTier) {
    const hasValidID = (kycTier.tier2.bvn?.verified || kycTier.tier2.nin?.verified);
    const hasAddress = kycTier.tier2.address?.street && kycTier.tier2.address?.city;

    return hasValidID && hasAddress;
  }

  // ============================================
  // Tier 3 - Full KYC
  // ============================================

  async submitTier3(userId, data) {
    try {
      const { idType, idNumber, idDocumentUrl, selfieUrl, proofOfAddressUrl } = data;

      // Verify Tier 2 is completed
      const kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier || kycTier.tier2.status !== 'verified') {
        throw new Error('Tier 2 KYC must be completed first');
      }

      // Validate required fields
      if (!idType || !idNumber || !idDocumentUrl || !selfieUrl || !proofOfAddressUrl) {
        throw new Error('All documents are required for Tier 3');
      }

      kycTier.tier3 = {
        idType,
        idNumber,
        idDocument: {
          url: idDocumentUrl,
          uploadedAt: new Date(),
          verified: false
        },
        selfie: {
          url: selfieUrl,
          uploadedAt: new Date(),
          verified: false
        },
        proofOfAddress: {
          url: proofOfAddressUrl,
          uploadedAt: new Date(),
          verified: false
        },
        faceVerification: {
          status: 'pending'
        },
        status: 'pending'
      };

      await kycTier.save();

      logger.info(`Tier 3 KYC submitted for user ${userId}`);

      return {
        success: true,
        message: 'Tier 3 KYC submitted for verification',
        tier: 'TIER_3',
        status: 'pending'
      };
    } catch (err) {
      logger.error('Tier 3 submission error:', err.message);
      throw err;
    }
  }

  async verifyTier3FaceMatch(userId, livenessScore, matchScore) {
    try {
      const kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier || !kycTier.tier3) {
        throw new Error('Tier 3 KYC not found');
      }

      // Verify liveness and face match
      const LIVENESS_THRESHOLD = 0.85;
      const MATCH_THRESHOLD = 0.90;

      if (livenessScore < LIVENESS_THRESHOLD) {
        kycTier.tier3.faceVerification.status = 'failed';
        kycTier.tier3.status = 'rejected';
        kycTier.tier3.rejectionReason = 'Liveness check failed';
        await kycTier.save();

        throw new Error('Liveness check failed. Please try again.');
      }

      if (matchScore < MATCH_THRESHOLD) {
        kycTier.tier3.faceVerification.status = 'failed';
        kycTier.tier3.status = 'rejected';
        kycTier.tier3.rejectionReason = 'Face match failed';
        await kycTier.save();

        throw new Error('Face match failed. Please try again.');
      }

      kycTier.tier3.selfie.livenessScore = livenessScore;
      kycTier.tier3.selfie.verified = true;
      kycTier.tier3.faceVerification.status = 'verified';
      kycTier.tier3.faceVerification.matchScore = matchScore;
      kycTier.tier3.faceVerification.verifiedAt = new Date();

      // Check if all Tier 3 requirements are met
      if (this.isTier3Complete(kycTier)) {
        kycTier.tier3.status = 'verified';
        kycTier.tier3.completedAt = new Date();
        kycTier.currentTier = 'TIER_3';

        // Update transaction limits
        this.updateTransactionLimits(kycTier, 'TIER_3');

        // Set KYC expiration (1 year)
        const expirationDate = new Date();
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);
        kycTier.expiresAt = expirationDate;
      }

      await kycTier.save();

      logger.info(`Face verification completed for user ${userId}`);

      return {
        success: true,
        message: 'Face verification successful',
        tier3Status: kycTier.tier3.status,
        currentTier: kycTier.currentTier
      };
    } catch (err) {
      logger.error('Face verification error:', err.message);
      throw err;
    }
  }

  isTier3Complete(kycTier) {
    return (
      kycTier.tier3.idDocument.verified &&
      kycTier.tier3.selfie.verified &&
      kycTier.tier3.proofOfAddress.verified &&
      kycTier.tier3.faceVerification.status === 'verified'
    );
  }

  // ============================================
  // Transaction Limits Management
  // ============================================

  updateTransactionLimits(kycTier, tier) {
    const limits = TIER_LIMITS[tier];

    kycTier.transactionLimits = {
      dailyLimit: limits.dailyLimit,
      monthlyLimit: limits.monthlyLimit,
      walletBalanceLimit: limits.walletBalanceLimit,
      singleTransactionLimit: limits.singleTransactionLimit,
      dailyUsed: 0,
      monthlyUsed: 0,
      _lastDailyReset: new Date(),
      _lastMonthlyReset: new Date()
    };
  }

  async checkTransactionAllowed(userId, amount) {
    try {
      const kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier) {
        return {
          allowed: false,
          reason: 'KYC not found'
        };
      }

      const limits = kycTier.transactionLimits;

      // Check single transaction limit (0 = unlimited)
      if (limits.singleTransactionLimit > 0 && amount > limits.singleTransactionLimit) {
        return {
          allowed: false,
          reason: `Amount exceeds single transaction limit of ₦${limits.singleTransactionLimit}`,
          limit: limits.singleTransactionLimit
        };
      }

      // Check daily limit (0 = unlimited)
      if (limits.dailyLimit > 0 && limits.dailyUsed + amount > limits.dailyLimit) {
        const remaining = limits.dailyLimit - limits.dailyUsed;
        return {
          allowed: false,
          reason: `Daily limit exceeded. Remaining: ₦${remaining}`,
          remaining
        };
      }

      // Check monthly limit (0 = unlimited)
      if (limits.monthlyLimit > 0 && limits.monthlyUsed + amount > limits.monthlyLimit) {
        const remaining = limits.monthlyLimit - limits.monthlyUsed;
        return {
          allowed: false,
          reason: `Monthly limit exceeded. Remaining: ₦${remaining}`,
          remaining
        };
      }

      return {
        allowed: true,
        remainingDaily: limits.dailyLimit - limits.dailyUsed,
        remainingMonthly: limits.monthlyLimit - limits.monthlyUsed
      };
    } catch (err) {
      logger.error('Transaction check error:', err.message);
      throw err;
    }
  }

  async recordTransaction(userId, amount) {
    try {
      const kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier) {
        throw new Error('KYC not found');
      }

      kycTier.transactionLimits.dailyUsed += amount;
      kycTier.transactionLimits.monthlyUsed += amount;

      await kycTier.save();

      return {
        success: true,
        dailyUsed: kycTier.transactionLimits.dailyUsed,
        monthlyUsed: kycTier.transactionLimits.monthlyUsed
      };
    } catch (err) {
      logger.error('Record transaction error:', err.message);
      throw err;
    }
  }

  // ============================================
  // KYC Status & Information
  // ============================================

  async getKYCStatus(userId) {
    try {
      const kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier) {
        return {
          currentTier: 'TIER_0',
          tier1: { status: 'not_started' },
          tier2: { status: 'not_started' },
          tier3: { status: 'not_started' },
          limits: TIER_LIMITS.TIER_0
        };
      }

      return {
        currentTier: kycTier.currentTier,
        tier1: {
          status: kycTier.tier1?.status || 'not_started',
          completedAt: kycTier.tier1?.completedAt,
          rejectionReason: kycTier.tier1?.rejectionReason
        },
        tier2: {
          status: kycTier.tier2?.status || 'not_started',
          completedAt: kycTier.tier2?.completedAt,
          rejectionReason: kycTier.tier2?.rejectionReason
        },
        tier3: {
          status: kycTier.tier3?.status || 'not_started',
          completedAt: kycTier.tier3?.completedAt,
          rejectionReason: kycTier.tier3?.rejectionReason
        },
        limits: TIER_LIMITS[kycTier.currentTier],
        transactionLimits: kycTier.transactionLimits,
        expiresAt: kycTier.expiresAt
      };
    } catch (err) {
      logger.error('Get KYC status error:', err.message);
      throw err;
    }
  }

  async getTierRequirements(tier) {
    const requirements = {
      TIER_1: {
        name: 'Basic KYC',
        requirements: [
          'Phone number (verified via OTP)',
          'First name',
          'Last name',
          'Date of birth'
        ],
        limits: TIER_LIMITS.TIER_1,
        estimatedTime: '5 minutes'
      },
      TIER_2: {
        name: 'Medium KYC',
        requirements: [
          'BVN (Bank Verification Number) OR NIN (National ID)',
          'BVN can be verified via Flutterwave or Alat/Wema endpoint',
          'Complete address (street, city, state)',
          'Tier 1 must be completed'
        ],
        limits: TIER_LIMITS.TIER_2,
        estimatedTime: '10 minutes'
      },
      TIER_3: {
        name: 'Full KYC',
        requirements: [
          'Valid ID (National ID, Passport, or Driver\'s License)',
          'Selfie with liveness check',
          'Proof of address document',
          'Face verification match',
          'Tier 2 must be completed'
        ],
        limits: TIER_LIMITS.TIER_3,
        estimatedTime: '15 minutes'
      }
    };

    return requirements[tier] || null;
  }

  // ============================================
  // Compliance & Risk Management
  // ============================================

  async flagTransaction(userId, transactionId, reason) {
    try {
      const kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier) {
        throw new Error('KYC not found');
      }

      kycTier.riskProfile.flaggedTransactions.push({
        transactionId,
        reason,
        flaggedAt: new Date()
      });

      // If too many flagged transactions, mark as suspicious
      if (kycTier.riskProfile.flaggedTransactions.length > 5) {
        kycTier.riskProfile.suspiciousActivity = true;
        kycTier.riskProfile.riskLevel = 'high';
      }

      await kycTier.save();

      logger.warn(`Transaction flagged for user ${userId}: ${reason}`);

      return {
        success: true,
        flagged: true
      };
    } catch (err) {
      logger.error('Flag transaction error:', err.message);
      throw err;
    }
  }

  async getRiskProfile(userId) {
    try {
      const kycTier = await this.KYCTier.findOne({ userId });

      if (!kycTier) {
        return {
          riskLevel: 'low',
          flaggedTransactions: [],
          suspiciousActivity: false
        };
      }

      return kycTier.riskProfile;
    } catch (err) {
      logger.error('Get risk profile error:', err.message);
      throw err;
    }
  }

  // ============================================
  // Utility Functions
  // ============================================

  async verifyOTP(phoneNumber, otp) {
    // Implement your OTP verification logic
    // This is a placeholder
    return true;
  }

  async resetDailyLimits() {
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      await this.KYCTier.updateMany(
        { 'transactionLimits._lastDailyReset': { $lt: yesterday } },
        {
          $set: {
            'transactionLimits.dailyUsed': 0,
            'transactionLimits._lastDailyReset': now
          }
        }
      );

      logger.info('Daily limits reset');
    } catch (err) {
      logger.error('Reset daily limits error:', err.message);
    }
  }

  async resetMonthlyLimits() {
    try {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

      await this.KYCTier.updateMany(
        { 'transactionLimits._lastMonthlyReset': { $lt: lastMonth } },
        {
          $set: {
            'transactionLimits.monthlyUsed': 0,
            'transactionLimits._lastMonthlyReset': now
          }
        }
      );

      logger.info('Monthly limits reset');
    } catch (err) {
      logger.error('Reset monthly limits error:', err.message);
    }
  }
}

module.exports = new KYCService();
