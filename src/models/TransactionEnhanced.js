const mongoose = require('mongoose');
const security = require('../utils/security');

const transactionSchema = new mongoose.Schema({
  // Core transaction data
  transactionId: {
    type: String,
    unique: true,
    required: true,
    default: () => 'TXN_' + security.generateSecureToken(16)
  },
  
  // Legacy fields (maintain backward compatibility)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Enhanced recipient handling
  recipientIdentifier: String, // Phone, email, or username for external recipients
  
  // Transaction details
  type: {
    type: String,
    enum: [
      'peer-to-peer', 'combine-split', 'payout', 'wallet_funding',
      'transfer', 'payment', 'withdrawal', 'deposit', 
      'bill_payment', 'airtime', 'data', 'cable_tv',
      'electricity', 'water', 'internet', 'loan_repayment',
      'merchant_payment', 'pos_transaction'
    ],
    required: true,
    index: true
  },
  
  amount: {
    type: Number,
    required: true,
    min: [1, 'Amount must be greater than 0'],
    max: [10000000, 'Amount exceeds maximum limit'] // ₦10M max
  },
  
  currency: {
    type: String,
    enum: ['NGN', 'USD'],
    default: 'NGN',
    required: true
  },
  
  // Enhanced fees structure
  fees: {
    feePercentage: { type: Number, default: 0 },
    feeAmount: { type: Number, default: 0 },
    processingFee: { type: Number, default: 0 },
    stampDuty: { type: Number, default: 0 }, // CBN stamp duty
    vatOnFee: { type: Number, default: 0 },
    totalFees: { type: Number, default: 0 }
  },
  
  netAmount: { type: Number }, // Amount after fees
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed'],
    default: 'pending',
    required: true,
    index: true
  },
  
  // Payment method details
  method: {
    type: String,
    enum: ['wallet', 'bank_transfer', 'card', 'ussd', 'qr_code', 'nfc', 'paystack', 'internal'],
    default: 'wallet'
  },
  
  // External payment processor details (enhanced)
  processorDetails: {
    processor: { type: String, enum: ['paystack', 'flutterwave', 'chimoney'] },
    processorTransactionId: String,
    processorReference: String,
    processorResponse: mongoose.Schema.Types.Mixed
  },
  
  // Legacy processor fields (maintain compatibility)
  chimonyTransactionId: String,
  chimonyStatus: { type: String, default: 'pending' },
  paystackTransactionId: String,
  paystackReference: String,
  flutterwaveTransactionId: String,
  flutterwaveReference: String,
  
  // Bank details (for bank transfers)
  bankDetails: {
    bankCode: String,
    bankName: String,
    accountNumber: String,
    accountName: String
  },
  
  // Bill payment details
  billDetails: {
    provider: String, // EKEDC, IKEDC, MTN, etc.
    customerNumber: String,
    customerName: String,
    productCode: String
  },
  
  // Transaction description and metadata
  description: String,
  reference: { type: String, unique: true, sparse: true },
  combineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Combine' },
  
  // Geolocation (for compliance)
  location: {
    latitude: Number,
    longitude: Number,
    address: String,
    city: String,
    state: String,
    country: { type: String, default: 'Nigeria' }
  },
  
  // Device information
  deviceInfo: {
    deviceId: String,
    deviceType: String, // mobile, web, pos
    ipAddress: String,
    userAgent: String,
    platform: String
  },
  
  // AML/Compliance flags
  compliance: {
    riskScore: { type: Number, min: 0, max: 100, default: 0 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    flagged: { type: Boolean, default: false },
    flagReason: String,
    reviewRequired: { type: Boolean, default: false },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    sanctionsChecked: { type: Boolean, default: false },
    sanctionsResult: String
  },
  
  // CBN Reporting fields
  reporting: {
    reportable: { type: Boolean, default: false }, // Transactions > ₦5M
    reported: { type: Boolean, default: false },
    reportedAt: Date,
    reportId: String,
    cbnCategory: String // CBN transaction category code
  },
  
  // Enhanced metadata
  metadata: mongoose.Schema.Types.Mixed,
  
  // Timestamps
  initiatedAt: { type: Date, default: Date.now },
  processedAt: Date,
  completedAt: Date,
  
  // Error handling
  errorCode: String,
  errorMessage: String,
  retryCount: { type: Number, default: 0, max: 3 },
  
  // Audit trail
  auditTrail: [{
    action: String,
    timestamp: { type: Date, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    details: mongoose.Schema.Types.Mixed
  }],
  
  // Data integrity
  checksum: String, // For data integrity verification
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      // Remove sensitive processor details from JSON output
      if (ret.processorDetails && ret.processorDetails.processorResponse) {
        ret.processorDetails.processorResponse = '[REDACTED]';
      }
      return ret;
    }
  }
});

// Indexes for performance and compliance queries
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ sender: 1, createdAt: -1 });
transactionSchema.index({ receiver: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 }, { unique: true });
transactionSchema.index({ reference: 1 }, { unique: true, sparse: true });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ amount: 1 });
transactionSchema.index({ 'compliance.flagged': 1 });
transactionSchema.index({ 'compliance.reviewRequired': 1 });
transactionSchema.index({ 'reporting.reportable': 1, 'reporting.reported': 1 });
transactionSchema.index({ createdAt: -1 });

// Pre-save middleware for compliance checks
transactionSchema.pre('save', function(next) {
  // Set reportable flag for transactions > ₦5M (CBN requirement)
  if (this.amount >= 5000000) {
    this.reporting.reportable = true;
  }
  
  // Calculate total fees
  if (this.fees) {
    this.fees.totalFees = (this.fees.processingFee || 0) + 
                         (this.fees.stampDuty || 0) + 
                         (this.fees.vatOnFee || 0) +
                         (this.fees.feeAmount || 0);
  }
  
  // Calculate net amount
  this.netAmount = this.amount - (this.fees?.totalFees || 0);
  
  // Generate checksum for data integrity
  const dataForChecksum = {
    transactionId: this.transactionId,
    sender: this.sender,
    receiver: this.receiver,
    amount: this.amount,
    type: this.type,
    status: this.status
  };
  this.checksum = security.generateChecksum(dataForChecksum);
  
  next();
});

// Method to add audit trail entry
transactionSchema.methods.addAuditEntry = function(action, userId, details) {
  this.auditTrail.push({
    action,
    userId,
    details,
    timestamp: new Date()
  });
  return this.save();
};

// Method to verify data integrity
transactionSchema.methods.verifyIntegrity = function() {
  const dataForChecksum = {
    transactionId: this.transactionId,
    sender: this.sender,
    receiver: this.receiver,
    amount: this.amount,
    type: this.type,
    status: this.status
  };
  const calculatedChecksum = security.generateChecksum(dataForChecksum);
  return security.secureCompare(this.checksum, calculatedChecksum);
};

// Static method to get transactions requiring CBN reporting
transactionSchema.statics.getReportableTransactions = function(startDate, endDate) {
  return this.find({
    'reporting.reportable': true,
    'reporting.reported': false,
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  });
};

// Static method to get flagged transactions
transactionSchema.statics.getFlaggedTransactions = function() {
  return this.find({
    'compliance.flagged': true,
    'compliance.reviewRequired': true
  }).populate('sender receiver', 'firstName lastName email phone');
};

module.exports = mongoose.model('Transaction', transactionSchema);