const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  // Wallet identification
  walletId: { type: String, unique: true, required: true }, // Unique identifier for the wallet
  type: {
    type: String,
    enum: ['USER_WALLET', 'COMMISSION_WALLET', 'SETTLEMENT_WALLET', 'PROVIDER_WALLET', 'ADMIN_WALLET'],
    required: true
  },

  // User association (only for USER_WALLET)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Balance and currency
  balance: { type: Number, default: 0, min: 0 }, // Balance in kobo/cents (smallest currency unit)
  currency: { type: String, enum: ['NGN', 'USD'], default: 'NGN' },

  // Wallet status
  status: {
    type: String,
    enum: ['active', 'inactive', 'frozen', 'suspended'],
    default: 'active'
  },

  // Provider information (for PROVIDER_WALLET)
  provider: {
    type: String,
    enum: ['flutterwave', 'wema', 'paystack', 'other']
  },

  // Virtual account details (for USER_WALLET)
  virtualAccount: {
    accountNumber: String,
    accountName: String,
    bankName: String,
    provider: { type: String, enum: ['wema', 'flutterwave'] },
    providerReference: String,
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
  },

  // Limits and controls
  dailyLimit: { type: Number, default: 10000000 }, // 100k NGN in kobo
  monthlyLimit: { type: Number, default: 100000000 }, // 1M NGN in kobo
  dailySpent: { type: Number, default: 0 },
  monthlySpent: { type: Number, default: 0 },
  lastResetDaily: { type: Date, default: Date.now },
  lastResetMonthly: { type: Date, default: Date.now },

  // Metadata
  name: String, // Human readable name
  description: String,

  // Audit fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Provider integration IDs
  providerIds: {
    flutterwave: {
      subAccountId: String,
      accountReference: String
    },
    wema: {
      virtualAccountId: String,
      accountReference: String
    }
  }
}, {
  timestamps: true
});

// Indexes
walletSchema.index({ type: 1, userId: 1 });
walletSchema.index({ walletId: 1 }, { unique: true });
walletSchema.index({ 'virtualAccount.accountNumber': 1 });
walletSchema.index({ status: 1 });
walletSchema.index({ createdAt: -1 });

// Static methods
walletSchema.statics.getUserWallet = function(userId, currency = 'NGN') {
  return this.findOne({ userId, type: 'USER_WALLET', currency, status: 'active' });
};

walletSchema.statics.getCommissionWallet = function(currency = 'NGN') {
  return this.findOne({ type: 'COMMISSION_WALLET', currency, status: 'active' });
};

walletSchema.statics.getSettlementWallet = function(currency = 'NGN') {
  return this.findOne({ type: 'SETTLEMENT_WALLET', currency, status: 'active' });
};

walletSchema.statics.getProviderWallet = function(provider, currency = 'NGN') {
  return this.findOne({ type: 'PROVIDER_WALLET', provider, currency, status: 'active' });
};

walletSchema.statics.getAdminWallet = function(currency = 'NGN') {
  return this.findOne({ type: 'ADMIN_WALLET', currency, status: 'active' });
};

// Instance methods
walletSchema.methods.canTransact = function(amount) {
  if (this.status !== 'active') return false;
  if (this.balance < amount) return false;

  // Check daily limit
  const now = new Date();
  if (now.getDate() !== this.lastResetDaily.getDate()) {
    this.dailySpent = 0;
    this.lastResetDaily = now;
  }
  if (this.dailySpent + amount > this.dailyLimit) return false;

  // Check monthly limit
  if (now.getMonth() !== this.lastResetMonthly.getMonth()) {
    this.monthlySpent = 0;
    this.lastResetMonthly = now;
  }
  if (this.monthlySpent + amount > this.monthlyLimit) return false;

  return true;
};

walletSchema.methods.debit = function(amount, description = '') {
  if (!this.canTransact(amount)) {
    throw new Error('Transaction not allowed');
  }

  this.balance -= amount;
  this.dailySpent += amount;
  this.monthlySpent += amount;

  return this.save();
};

walletSchema.methods.credit = function(amount, description = '') {
  this.balance += amount;
  return this.save();
};

walletSchema.methods.freeze = function() {
  this.status = 'frozen';
  return this.save();
};

walletSchema.methods.unfreeze = function() {
  this.status = 'active';
  return this.save();
};

module.exports = mongoose.model('WalletV2', walletSchema);