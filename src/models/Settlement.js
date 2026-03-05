const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
  walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'MerchantWallet', required: true },
  
  // Settlement Details
  amount: { type: Number, required: true }, // in cents
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  
  // Fees
  commission: { type: Number, default: 0 }, // Already deducted
  platformFee: { type: Number, default: 0 },
  fixedFee: { type: Number, default: 0 },
  totalFee: { type: Number, default: 0 },
  netAmount: { type: Number, required: true }, // Amount after fees
  
  // Status Flow
  status: { 
    type: String, 
    enum: ['scheduled', 'initiated', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'scheduled'
  },
  
  // Settlement Dates
  scheduledDate: { type: Date, required: true },
  initiatedDate: Date,
  completedDate: Date,
  
  // Bank Details
  bankAccount: {
    accountNumber: String,
    bankCode: String,
    bankName: String,
    accountName: String
  },
  
  // Payment Gateway Details
  paymentGateway: { type: String, enum: ['paystack', 'flutterwave'], default: 'paystack' },
  paymentGatewayReference: String,
  paymentGatewayTransactionId: String,
  
  // Linked Transactions
  transactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MerchantTransaction'
  }],
  transactionCount: { type: Number, default: 0 },
  
  // Metadata
  description: String,
  reference: String, // Internal reference
  
  // Failure Details (if failed)
  failureReason: String,
  failedAt: Date,
  retryCount: { type: Number, default: 0 },
  nextRetryDate: Date,
  
  // Notes
  notes: String,
  adminNotes: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Indexes
settlementSchema.index({ merchantId: 1, createdAt: -1 });
settlementSchema.index({ status: 1 });
settlementSchema.index({ scheduledDate: 1 });
settlementSchema.index({ completedDate: 1 });

module.exports = mongoose.model('Settlement', settlementSchema);
