const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  balance: { type: Number, default: 0 }, // Main balance in cents
  currency: { type: String, default: 'USD' },
  
  // Multi-currency support
  multicurrencyBalances: [{
    currency: String,
    balance: { type: Number, default: 0 },
  }],
  
  // Transaction limits
  dailyLimit: { type: Number, default: 10000 * 100 }, // $10k in cents
  monthlyLimit: { type: Number, default: 100000 * 100 }, // $100k
  
  // For Chimoney integration
  chimoneySubAccountId: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);
