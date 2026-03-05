const mongoose = require('mongoose');

const merchantWalletSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true, unique: true },
  
  // Balance Tracking
  balance: { type: Number, default: 0 }, // Available balance in cents
  pendingBalance: { type: Number, default: 0 }, // Awaiting settlement
  settledBalance: { type: Number, default: 0 }, // Already settled
  
  // Cumulative
  totalEarned: { type: Number, default: 0 }, // Total earned (before fees)
  totalCommission: { type: Number, default: 0 }, // Total commission deducted
  totalSettled: { type: Number, default: 0 }, // Total settled to bank
  
  // Currency
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  
  // Settlement Details
  lastSettlementDate: Date,
  nextSettlementDate: Date,
  settlementStatus: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  
  // Bank Account
  bankAccount: {
    accountNumber: String,
    bankCode: String,
    bankName: String,
    accountName: String,
    verified: { type: Boolean, default: false }
  },
  
  // Hold (for disputes or compliance)
  onHold: { type: Boolean, default: false },
  holdReason: String,
  holdAmount: { type: Number, default: 0 },
  holdReleaseDate: Date,
  
  // Transaction History (last 100)
  transactions: [{
    transactionId: mongoose.Schema.Types.ObjectId,
    type: { type: String, enum: ['credit', 'debit'] },
    amount: Number,
    description: String,
    date: { type: Date, default: Date.now },
    referenceId: String
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Method to add funds
merchantWalletSchema.methods.addFunds = function(amount, description, referenceId) {
  this.balance += amount;
  this.totalEarned += amount;
  
  this.transactions.push({
    type: 'credit',
    amount,
    description,
    referenceId,
    date: new Date()
  });
  
  // Keep only last 100 transactions
  if (this.transactions.length > 100) {
    this.transactions = this.transactions.slice(-100);
  }
};

// Method to deduct funds
merchantWalletSchema.methods.deductFunds = function(amount, description, referenceId) {
  if (this.balance < amount) {
    throw new Error('Insufficient balance');
  }
  
  this.balance -= amount;
  
  this.transactions.push({
    type: 'debit',
    amount,
    description,
    referenceId,
    date: new Date()
  });
  
  if (this.transactions.length > 100) {
    this.transactions = this.transactions.slice(-100);
  }
};

module.exports = mongoose.model('MerchantWallet', merchantWalletSchema);
