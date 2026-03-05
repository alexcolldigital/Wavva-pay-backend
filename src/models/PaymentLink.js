const mongoose = require('mongoose');

const paymentLinkSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
  
  // Link Details
  title: { type: String, required: true },
  description: String,
  amount: { type: Number, required: true }, // in cents (null = variable amount)
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  
  // Link Configuration
  slug: { type: String, unique: true, sparse: true },
  customUrl: String,
  qrCode: String, // QR code image URL
  expiresAt: Date,
  
  // Settings
  allowCustomAmount: { type: Boolean, default: false },
  requireCustomerDetails: { type: Boolean, default: false },
  

  // Metadata
  metadata: {
    orderId: String,
    customerId: String,
    invoiceId: String,
    tags: [String]
  },
  
  // Status
  status: { type: String, enum: ['active', 'inactive', 'expired'], default: 'active' },
  
  // Analytics
  views: { type: Number, default: 0 },
  initiateCount: { type: Number, default: 0 }, // Started payment process
  completedCount: { type: Number, default: 0 }, // Completed payments
  failedCount: { type: Number, default: 0 }, // Failed payments
  totalValue: { type: Number, default: 0 }, // Total amount from successful payments
  
  // Redirect Settings
  successUrl: String,
  cancelUrl: String,
  
  // Payment Methods
  paymentMethods: [{ 
    type: String, 
    enum: ['card', 'bank_transfer', 'wallet', 'ussd'], 
    default: 'card' 
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Indexes for faster queries
paymentLinkSchema.index({ merchantId: 1, createdAt: -1 });
paymentLinkSchema.index({ slug: 1 });
paymentLinkSchema.index({ status: 1 });

module.exports = mongoose.model('PaymentLink', paymentLinkSchema);
