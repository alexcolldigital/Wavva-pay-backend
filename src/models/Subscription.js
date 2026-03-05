const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Subscription Details
  subscriptionCode: { type: String, unique: true }, // AUTO-GENERATED
  planName: { type: String, required: true },
  description: String,
  
  // Pricing
  amount: { type: Number, required: true }, // in cents
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  
  // Billing Frequency
  frequency: { 
    type: String, 
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'semi-annual', 'annual'],
    required: true 
  },
  frequencyDays: { type: Number }, // Auto-calculated (7 for weekly, 30 for monthly, etc.)
  
  // Duration
  startDate: { type: Date, required: true },
  endDate: Date, // Null for indefinite subscriptions
  duration: { type: String, enum: ['indefinite', 'fixed'], default: 'indefinite' },
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'paused', 'cancelled', 'expired'],
    default: 'active'
  },
  
  // Payment Method
  paymentMethod: { 
    type: String, 
    enum: ['card', 'bank_transfer', 'wallet'],
    default: 'card'
  },
  paymentDetails: {
    cardToken: String, // For automated card charging
    bankAccount: String,
    walletId: String
  },
  
  // Billing Cycle Tracking
  nextBillingDate: { type: Date, required: true },
  lastBillingDate: Date,
  
  // Transaction History
  totalCharges: { type: Number, default: 0 }, // Total successful charges
  nextChargeAmount: { type: Number }, // Amount for next billing (may differ from amount)
  
  // Auto-renewal
  autoRenew: { type: Boolean, default: true },
  renewalCount: { type: Number, default: 0 },
  
  // Billing Cycle
  billingCycleCount: { type: Number, default: 0 }, // Number of billing cycles
  maxBillingCycles: { type: Number }, // For limited subscriptions
  
  // Pause/Resume
  pausedAt: Date,
  pauseReason: String,
  
  // Cancellation
  cancelledAt: Date,
  cancellationReason: String,
  cancellationType: { type: String, enum: ['customer_request', 'failed_payment', 'admin_action'] },
  
  // Notifications
  notificationEmail: String,
  notifyBefore: { type: Number, default: 3 }, // Notify N days before renewal
  
  // Metadata & Custom Fields
  metadata: {
    customerId: String,
    orderId: String,
    projectId: String,
    customFields: Map
  },
  
  // Failed Attempts
  failedAttempts: { type: Number, default: 0 },
  lastFailureReason: String,
  lastFailureDate: Date,
  maxRetryAttempts: { type: Number, default: 5 },
  
  // Invoice Generation
  generateInvoice: { type: Boolean, default: true },
  invoiceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }],
  
  // Discount/Promo
  discountCode: String,
  discountAmount: { type: Number, default: 0 }, // in cents
  discountExpiresAt: Date,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Indexes
subscriptionSchema.index({ merchantId: 1, status: 1 });
subscriptionSchema.index({ customerId: 1, status: 1 });
subscriptionSchema.index({ nextBillingDate: 1, status: 1 });
subscriptionSchema.index({ subscriptionCode: 1 });

// Auto-calculate frequency days
subscriptionSchema.pre('save', function(next) {
  const frequencyMap = {
    'daily': 1,
    'weekly': 7,
    'monthly': 30,
    'quarterly': 90,
    'semi-annual': 180,
    'annual': 365
  };
  
  this.frequencyDays = frequencyMap[this.frequency] || 30;
  
  // Auto-generate subscription code if new
  if (this.isNew && !this.subscriptionCode) {
    this.subscriptionCode = `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  next();
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
