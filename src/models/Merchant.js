const mongoose = require('mongoose');

const merchantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  
  // Business Information
  businessName: { type: String, required: true },
  businessType: { type: String, enum: ['sole_proprietor', 'sme', 'corporate', 'ngo'], required: true },
  phone: { type: String, required: true },
  website: String,
  email: String,
  logo: String,
  logoPublicId: String, // Cloudinary ID
  description: String,
  
  // Address
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'Nigeria' }
  },
  
  // Status & Verification
  status: { type: String, enum: ['pending', 'active', 'suspended', 'rejected'], default: 'pending' },
  tier: { type: String, enum: ['basic', 'pro', 'enterprise'], default: 'basic' },
  
  // KYC
  kycId: { type: mongoose.Schema.Types.ObjectId, ref: 'MerchantKYC' },
  kycVerified: { type: Boolean, default: false },
  kycVerificationDate: Date,
  
  // Settings
  settings: {
    autoSettlement: { type: Boolean, default: true },
    settlementDay: { type: Number, default: 1 }, // 1-7 for weekly, 1-31 for monthly
    settlementFrequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
    notificationEmail: String,
    webhookUrl: String,
    webhookSecret: String,
    commissionRate: { type: Number, default: 1.5 }, // 1.5% commission
  },
  
  // Bank Account for Settlement
  bankAccount: {
    accountNumber: String,
    bankCode: String,
    bankName: String,
    accountName: String,
    verified: { type: Boolean, default: false },
    verifiedDate: Date
  },
  
  // Stats
  totalRevenue: { type: Number, default: 0 }, // in cents
  totalTransactions: { type: Number, default: 0 },
  totalCustomers: { type: Number, default: 0 },
  avgTransactionValue: { type: Number, default: 0 }, // in cents
  
  // Limits (tier-based)
  limits: {
    dailyTransaction: { type: Number, default: 10000000 }, // 100,000 NGN in cents
    monthlyTransaction: { type: Number, default: 100000000 }, // 1,000,000 NGN
    dailyTransactionCount: { type: Number, default: 1000 },
    monthlyTransactionCount: { type: Number, default: 10000 }
  },
  
  // Usage Tracking
  usage: {
    dailyTransactionCount: { type: Number, default: 0 },
    monthlyTransactionCount: { type: Number, default: 0 },
    dailyTransactionAmount: { type: Number, default: 0 },
    monthlyTransactionAmount: { type: Number, default: 0 },
    lastResetDaily: { type: Date, default: Date.now },
    lastResetMonthly: { type: Date, default: Date.now }
  },
  
  // API
  apiKeys: [{
    key: String,
    name: String,
    permissions: [String],
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: Date
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Method to generate API key
merchantSchema.methods.generateAPIKey = function(name = 'Default API Key') {
  const key = `sk_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
  this.apiKeys.push({
    key,
    name,
    permissions: ['payments:read', 'payments:create', 'transactions:read'],
    active: true,
    createdAt: new Date()
  });
  return key;
};

// Method to check daily limits
merchantSchema.methods.checkDailyLimits = function(amount) {
  const now = new Date();
  const lastReset = new Date(this.usage.lastResetDaily);
  
  // Reset if new day
  if (now.getDate() !== lastReset.getDate() || 
      now.getMonth() !== lastReset.getMonth() || 
      now.getFullYear() !== lastReset.getFullYear()) {
    this.usage.dailyTransactionCount = 0;
    this.usage.dailyTransactionAmount = 0;
    this.usage.lastResetDaily = now;
  }
  
  return {
    canProceed: this.usage.dailyTransactionAmount + amount <= this.limits.dailyTransaction &&
                this.usage.dailyTransactionCount < this.limits.dailyTransactionCount,
    dailyUsed: this.usage.dailyTransactionAmount,
    dailyLimit: this.limits.dailyTransaction,
    transactionsToday: this.usage.dailyTransactionCount,
    transactionLimitToday: this.limits.dailyTransactionCount
  };
};

module.exports = mongoose.model('Merchant', merchantSchema);
