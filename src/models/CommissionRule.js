const mongoose = require('mongoose');

const commissionRuleSchema = new mongoose.Schema({
  // Rule identification
  ruleId: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  description: String,

  // Transaction type this rule applies to
  transactionType: {
    type: String,
    enum: [
      'transfer',
      'funding',
      'withdrawal',
      'bill_payment',
      'airtime',
      'data',
      'cable',
      'electricity',
      'merchant_payment',
      'card_payment',
      'bank_transfer'
    ],
    required: true
  },

  // Fee structure
  feeType: {
    type: String,
    enum: ['fixed', 'percentage', 'tiered', 'free'],
    default: 'percentage'
  },

  // Fixed fee amount (in kobo/cents)
  fixedFee: { type: Number, default: 0 },

  // Percentage fee
  percentageFee: { type: Number, default: 0 }, // e.g., 1.5 for 1.5%

  // Tiered fee structure
  tiers: [{
    minAmount: { type: Number, required: true }, // Minimum amount in kobo/cents
    maxAmount: { type: Number }, // Maximum amount (null for unlimited)
    fee: { type: Number, required: true }, // Fee amount or percentage
    feeType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' }
  }],

  // Special conditions
  conditions: {
    // Free transfers for first N transactions per day
    freeDailyTransfers: { type: Number, default: 0 },

    // Minimum amount for fee application
    minAmountForFee: { type: Number, default: 0 },

    // Government fee for amounts above threshold
    govtFeeThreshold: { type: Number, default: 0 }, // Amount in kobo/cents
    govtFee: { type: Number, default: 0 }, // Government fee amount

    // Cap on percentage fees
    percentageCap: { type: Number }, // Maximum fee amount for percentage fees
  },

  // Currency
  currency: { type: String, enum: ['NGN', 'USD'], default: 'NGN' },

  // Status
  isActive: { type: Boolean, default: true },

  // Priority (higher number = higher priority)
  priority: { type: Number, default: 1 },

  // Valid date range
  validFrom: { type: Date, default: Date.now },
  validTo: { type: Date },

  // Audit fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

// Indexes
commissionRuleSchema.index({ transactionType: 1, currency: 1, isActive: 1 });
commissionRuleSchema.index({ priority: -1 });
commissionRuleSchema.index({ ruleId: 1 }, { unique: true });

// Instance methods
commissionRuleSchema.methods.calculateFee = function(amount, userContext = {}) {
  // Check if transaction is free
  if (this.feeType === 'free') {
    return { fee: 0, govtFee: 0, totalFee: 0 };
  }

  // Check free daily transfers condition
  if (this.conditions.freeDailyTransfers > 0 && userContext.dailyTransferCount < this.conditions.freeDailyTransfers) {
    return { fee: 0, govtFee: 0, totalFee: 0 };
  }

  let fee = 0;
  let govtFee = 0;

  switch (this.feeType) {
    case 'fixed':
      fee = this.fixedFee;
      break;

    case 'percentage':
      fee = Math.round((amount * this.percentageFee) / 100);
      if (this.conditions.percentageCap && fee > this.conditions.percentageCap) {
        fee = this.conditions.percentageCap;
      }
      break;

    case 'tiered':
      const applicableTier = this.tiers.find(tier =>
        amount >= tier.minAmount && (!tier.maxAmount || amount <= tier.maxAmount)
      );
      if (applicableTier) {
        if (applicableTier.feeType === 'fixed') {
          fee = applicableTier.fee;
        } else {
          fee = Math.round((amount * applicableTier.fee) / 100);
        }
      }
      break;
  }

  // Apply minimum amount condition
  if (amount < this.conditions.minAmountForFee) {
    fee = 0;
  }

  // Calculate government fee
  if (this.conditions.govtFeeThreshold && amount >= this.conditions.govtFeeThreshold) {
    govtFee = this.conditions.govtFee;
  }

  const totalFee = fee + govtFee;

  return {
    fee,
    govtFee,
    totalFee,
    breakdown: {
      baseFee: fee,
      govtFee,
      percentage: this.percentageFee,
      cap: this.conditions.percentageCap
    }
  };
};

// Static methods
commissionRuleSchema.statics.getApplicableRule = function(transactionType, currency = 'NGN') {
  return this.findOne({
    transactionType,
    currency,
    isActive: true,
    $or: [
      { validTo: { $exists: false } },
      { validTo: { $gte: new Date() } }
    ]
  }).sort({ priority: -1 });
};

commissionRuleSchema.statics.calculateCommission = async function(transactionType, amount, currency = 'NGN', userContext = {}) {
  const rule = await this.getApplicableRule(transactionType, currency);
  if (!rule) {
    return { fee: 0, govtFee: 0, totalFee: 0, rule: null };
  }

  const feeCalculation = rule.calculateFee(amount, userContext);
  return { ...feeCalculation, rule: rule._id };
};

module.exports = mongoose.model('CommissionRule', commissionRuleSchema);