const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema({
  // Unique ledger entry ID
  ledgerId: { type: String, unique: true, required: true },

  // Transaction reference
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  reference: { type: String, required: true }, // External reference (Flutterwave, Wema, etc.)

  // Wallet movements
  fromWallet: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletV2' },
  toWallet: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletV2' },

  // Amounts
  amount: { type: Number, required: true }, // Amount in kobo/cents
  fee: { type: Number, default: 0 }, // Platform fee in kobo/cents
  providerFee: { type: Number, default: 0 }, // Provider fee in kobo/cents
  commission: { type: Number, default: 0 }, // Commission earned in kobo/cents

  // Currency
  currency: { type: String, enum: ['NGN', 'USD'], default: 'NGN' },

  // Transaction type
  type: {
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
      'commission_credit',
      'settlement',
      'refund',
      'chargeback',
      'fee_collection'
    ],
    required: true
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed'],
    default: 'pending'
  },

  // Provider information
  provider: {
    type: String,
    enum: ['flutterwave', 'wema', 'paystack', 'internal', 'manual']
  },
  providerReference: String,

  // User information
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant' },

  // Description and metadata
  description: String,
  metadata: mongoose.Schema.Types.Mixed,

  // Audit fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Reversal information
  reversedLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ledger' },
  reversalReason: String
}, {
  timestamps: true
});

// Indexes
ledgerSchema.index({ ledgerId: 1 }, { unique: true });
ledgerSchema.index({ transactionId: 1 });
ledgerSchema.index({ reference: 1 });
ledgerSchema.index({ fromWallet: 1 });
ledgerSchema.index({ toWallet: 1 });
ledgerSchema.index({ userId: 1 });
ledgerSchema.index({ type: 1 });
ledgerSchema.index({ status: 1 });
ledgerSchema.index({ createdAt: -1 });
ledgerSchema.index({ provider: 1, createdAt: -1 });

// Static methods
ledgerSchema.statics.createEntry = async function(data) {
  const ledgerId = `LEDGER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  const entry = new this({ ...data, ledgerId });
  return entry.save();
};

ledgerSchema.statics.getUserLedger = function(userId, limit = 50, skip = 0) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('fromWallet', 'type name')
    .populate('toWallet', 'type name')
    .populate('transactionId');
};

ledgerSchema.statics.getWalletBalance = async function(walletId) {
  const credits = await this.aggregate([
    { $match: { toWallet: mongoose.Types.ObjectId(walletId), status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const debits = await this.aggregate([
    { $match: { fromWallet: mongoose.Types.ObjectId(walletId), status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const creditTotal = credits.length > 0 ? credits[0].total : 0;
  const debitTotal = debits.length > 0 ? debits[0].total : 0;

  return creditTotal - debitTotal;
};

ledgerSchema.statics.reverseEntry = async function(ledgerId, reason, reversedBy) {
  const originalEntry = await this.findOne({ ledgerId });
  if (!originalEntry) {
    throw new Error('Ledger entry not found');
  }

  if (originalEntry.status === 'reversed') {
    throw new Error('Entry already reversed');
  }

  // Create reversal entry
  const reversalEntry = await this.createEntry({
    transactionId: originalEntry.transactionId,
    reference: `REV-${originalEntry.reference}`,
    fromWallet: originalEntry.toWallet,
    toWallet: originalEntry.fromWallet,
    amount: originalEntry.amount,
    fee: 0,
    providerFee: 0,
    commission: 0,
    currency: originalEntry.currency,
    type: 'refund',
    status: 'completed',
    provider: 'internal',
    userId: originalEntry.userId,
    merchantId: originalEntry.merchantId,
    description: `Reversal: ${reason}`,
    metadata: { originalLedgerId: originalEntry._id },
    createdBy: reversedBy,
    reversedLedgerId: originalEntry._id,
    reversalReason: reason
  });

  // Update original entry
  originalEntry.status = 'reversed';
  originalEntry.reversedLedgerId = reversalEntry._id;
  originalEntry.reversalReason = reason;
  await originalEntry.save();

  return reversalEntry;
};

module.exports = mongoose.model('Ledger', ledgerSchema);