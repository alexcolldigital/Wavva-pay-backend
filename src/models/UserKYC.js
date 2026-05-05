const mongoose = require('mongoose');

const userKYCSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  
  // Identity Verification
  idType: {
    type: String,
    enum: ['passport', 'driver_license', 'nin', 'voter_card', 'national_id'],
    required: true
  },
  idNumber: String,
  idDocument: String, // URL
  idDocumentPublicId: String, // Cloudinary ID
  
  // Personal Details
  firstName: String,
  lastName: String,
  dateOfBirth: Date,
  gender: String,
  
  // Address
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'Nigeria' }
  },
  
  // Verification Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'expired'],
    default: 'pending'
  },
  verified: { type: Boolean, default: false },
  verifiedDate: Date,
  
  // Liveness/Selfie Verification (optional)
  selfieDocument: String,
  selfieDocumentPublicId: String,
  livenessVerified: { type: Boolean, default: false },
  
  // KYC Level
  kycLevel: {
    type: Number,
    enum: [0, 1, 2, 3], // 0: unverified, 1: basic, 2: intermediate, 3: full
    default: 0
  },
  
  // Rejection/Resubmission
  rejectionReason: String,
  rejectionDate: Date,
  resubmissionCount: { type: Number, default: 0 },
  maxResubmissions: { type: Number, default: 3 },
  
  // Submission History
  submissions: [{
    submittedAt: Date,
    status: String, // pending, approved, rejected
    comment: String,
    reviewedBy: String, // admin ID
    reviewedAt: Date
  }],
  
  // Transaction Limits (based on KYC level)
  limits: {
    dailyLimit: { type: Number, default: 500000 }, // KYC Level 0
    monthlyLimit: { type: Number, default: 5000000 },
    singleTransactionLimit: { type: Number, default: 1000000 }
  },
  
  // Expiry
  expiryDate: Date,
  requiresReverification: { type: Boolean, default: false },
  
  // Compliance
  risklevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low'
  },
  flaggedForReview: { type: Boolean, default: false },
  complianceNotes: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Index for efficient queries
userKYCSchema.index({ userId: 1 });
userKYCSchema.index({ status: 1 });
userKYCSchema.index({ verified: 1 });
userKYCSchema.index({ kycLevel: 1 });

module.exports = mongoose.model('UserKYC', userKYCSchema);
