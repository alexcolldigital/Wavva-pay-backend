const mongoose = require('mongoose');

const merchantTransactionSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
  paymentLinkId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentLink' },
  
  // Customer
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null if guest
  customerEmail: String,
  customerPhone: String,
  customerName: String,
  
  // Payment Details
  amount: { type: Number, required: true }, // in cents
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  
  // Commission & Fees
  commission: { type: Number, default: 0 }, // in cents
  platformFee: { type: Number, default: 0 }, // in cents
  totalFee: { type: Number, default: 0 }, // commission + platformFee
  netAmount: { type: Number, default: 0 }, // amount - totalFee
  
  // Transaction Status
  status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
  
  // Payment Method
  paymentMethod: { type: String, enum: ['card', 'bank_transfer', 'wallet', 'ussd', 'qr'], default: 'card' },
  
  // Payment Gateway Reference
  paystackReference: String,
  paystackTransactionId: String,
  paymentGateway: { type: String, enum: ['paystack', 'flutterwave', 'stripe'], default: 'paystack' },
  
  // Metadata
  metadata: {
    orderId: String,
    invoiceId: String,
    customFields: Map
  },
  
  // Dispute
  disputed: { type: Boolean, default: false },
    disputeReason: String,
  disputedAt: Date,
  disputeResolution: String,
  
  // Refund
  refunded: { type: Boolean, default: false },
  refundAmount: Number,
  refundReason: String,
  refundedAt: Date,
  refundTransactionId: String,
  
  // Timestamps
  initiatedAt: { type: Date, default: Date.now },
  completedAt: Date,
  failedAt: Date,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Indexes
merchantTransactionSchema.index({ merchantId: 1, createdAt: -1 });
merchantTransactionSchema.index({ status: 1 });
merchantTransactionSchema.index({ paymentLinkId: 1 });
merchantTransactionSchema.index({ paystackReference: 1 });

module.exports = mongoose.model('MerchantTransaction', merchantTransactionSchema);
