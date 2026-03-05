const mongoose = require('mongoose');

const commissionLedgerSchema = new mongoose.Schema({
  // Source of commission
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  merchantTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MerchantTransaction' },
  
  // Commission details
  amount: { type: Number, required: true }, // Commission amount in cents
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  
  // Source of commission
  source: { 
    type: String, 
    enum: ['p2p_transfer', 'wallet_funding', 'bank_transfer', 'merchant_payment', 'combine_split', 'payment_request', 'nfc_transfer', 'bill_payment', 'other'],
    required: true 
  },
  
  // Users involved
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User who incurred the fee
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Recipient (if applicable)
  
  // Merchant (if applicable)
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant' },
  
  // Description
  description: String,
  feePercentage: { type: Number }, // Percentage that was charged
  grossAmount: { type: Number }, // Original transaction amount
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'credited', 'reversed'],
    default: 'credited'
  },
  
  // Internal tracking
  ledgerEntryNumber: { type: String, unique: true }, // Formatted: COM-YYYYMMDD-XXXXX
  notes: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Index for fast lookups
commissionLedgerSchema.index({ createdAt: -1 });
commissionLedgerSchema.index({ source: 1, createdAt: -1 });
commissionLedgerSchema.index({ transactionId: 1 });
commissionLedgerSchema.index({ merchantId: 1 });
commissionLedgerSchema.index({ currency: 1 });
commissionLedgerSchema.index({ ledgerEntryNumber: 1 });

// Virtual for formatted amount (in standard decimal format)
commissionLedgerSchema.virtual('formattedAmount').get(function() {
  return (this.amount / 100).toFixed(2);
});

// Method to get commission summary by source
commissionLedgerSchema.statics.getCommissionSummary = async function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'credited'
      }
    },
    {
      $group: {
        _id: '$source',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
};

// Method to get total commission collected
commissionLedgerSchema.statics.getTotalCommission = async function(filters = {}) {
  const match = { status: 'credited', ...filters };
  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  return result.length > 0 ? result[0] : { totalAmount: 0, avgAmount: 0, count: 0 };
};

module.exports = mongoose.model('CommissionLedger', commissionLedgerSchema);
