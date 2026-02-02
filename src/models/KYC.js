const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  
  // Personal Information
  personalInfo: {
    dateOfBirth: { type: Date, required: true },
    nationality: { type: String, required: true },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, required: true },
      postalCode: { type: String, required: true }
    },
    occupation: { type: String, required: true },
    sourceOfIncome: { type: String, required: true, enum: ['employment', 'business', 'investment', 'other'] },
    bvn: { type: String }, // Bank Verification Number for Nigerian users
    nin: { type: String }, // National Identification Number
  },
  
  // Identity Documents
  documents: {
    idType: { type: String, required: true, enum: ['passport', 'drivers_license', 'national_id', 'voters_card'] },
    idNumber: { type: String, required: true },
    idExpiryDate: { type: Date, required: true },
    idFrontImage: { type: String, required: true }, // Cloudinary URL
    idBackImage: { type: String }, // Optional for some documents
    selfieImage: { type: String, required: true }, // For face verification
    proofOfAddress: { type: String, required: true }, // Utility bill, bank statement, etc.
    additionalDocuments: [{ // For enhanced due diligence
      type: { type: String },
      url: { type: String },
      uploadedAt: { type: Date, default: Date.now }
    }]
  },
  
  // Verification Status
  status: { 
    type: String, 
    enum: ['pending', 'under_review', 'approved', 'rejected', 'expired', 'requires_edd'], 
    default: 'pending' 
  },
  
  // Risk Assessment
  riskLevel: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'], 
    default: 'medium' 
  },
  
  // Third-party Verification
  smileIdentityJobId: { type: String },
  smileIdentityResult: {
    verified: { type: Boolean, default: false },
    confidence: { type: Number },
    completedAt: { type: Date },
    result: { type: mongoose.Schema.Types.Mixed }
  },
  
  // BVN Verification
  bvnVerification: {
    verified: { type: Boolean, default: false },
    jobId: { type: String },
    verifiedAt: { type: Date },
    result: { type: mongoose.Schema.Types.Mixed }
  },
  
  // Sanctions Screening
  sanctionsScreening: {
    screenedAt: { type: Date },
    riskScore: { type: Number, default: 0 },
    isPEP: { type: Boolean, default: false }, // Politically Exposed Person
    cleared: { type: Boolean, default: false },
    lastScreened: { type: Date },
    results: { type: mongoose.Schema.Types.Mixed }
  },
  
  // Enhanced Due Diligence
  enhancedDueDiligence: {
    required: { type: Boolean, default: false },
    performedAt: { type: Date },
    status: { type: String, enum: ['pending', 'passed', 'failed'] },
    results: { type: mongoose.Schema.Types.Mixed },
    nextReviewDate: { type: Date }
  },
  
  // Verification Details
  verificationDetails: {
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String,
    expiryDate: Date, // KYC expires after certain period
    lastUpdated: { type: Date, default: Date.now },
    autoVerified: { type: Boolean, default: false },
    manualReviewRequired: { type: Boolean, default: false }
  },
  
  // Transaction Limits based on KYC level
  transactionLimits: {
    dailyLimit: { type: Number, default: 50000 }, // in kobo for NGN
    monthlyLimit: { type: Number, default: 500000 },
    singleTransactionLimit: { type: Number, default: 100000 },
    internationalLimit: { type: Number, default: 0 }, // Default no international transfers
    lastUpdated: { type: Date, default: Date.now }
  },
  
  // Compliance Notes
  complianceNotes: [{
    note: { type: String },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now },
    category: { type: String, enum: ['verification', 'risk_assessment', 'sanctions', 'edd', 'other'] }
  }]
}, { timestamps: true });

// Index for efficient queries
kycSchema.index({ status: 1 });
kycSchema.index({ 'verificationDetails.submittedAt': 1 });

module.exports = mongoose.model('KYC', kycSchema);