const mongoose = require('mongoose');

const merchantKYCSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true, unique: true },
  
  // Business Documents
  businessRegistration: {
    number: String,
    document: String, // URL
    documentPublicId: String, // Cloudinary ID
    verified: { type: Boolean, default: false },
    verifiedDate: Date
  },
  
  // Directors/Owners
  directors: [{
    name: String,
    email: String,
    phone: String,
    idType: String, // passport, license, nin, etc.
    idNumber: String,
    idDocument: String, // URL
    idDocumentPublicId: String,
    dateOfBirth: Date,
    verified: { type: Boolean, default: false },
    verifiedDate: Date
  }],
  
  // Bank Account Verification
  bankAccount: {
    accountNumber: String,
    bankCode: String,
    bankName: String,
    accountName: String,
    verificationDocument: String, // Bank statement
    documentPublicId: String,
    verified: { type: Boolean, default: false },
    verifiedDate: Date
  },
  
  // KYC Status
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  verified: { type: Boolean, default: false },
  verifiedDate: Date,
  kycLevel: { type: Number, enum: [1, 2, 3], default: 1 },
  
  // Rejection reason
  rejectionReason: String,
  rejectionDate: Date,
  
  // Submission history
  submissions: [{
    submittedAt: Date,
    status: String,
    comment: String
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('MerchantKYC', merchantKYCSchema);
