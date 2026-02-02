const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  
  // Primary balance (legacy, for backward compatibility)
  balance: { type: Number, default: 0 }, // Main balance in cents
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  
  // Dual wallet support - USD and NGN
  wallets: [
    {
      currency: { type: String, enum: ['USD', 'NGN'], required: true },
      balance: { type: Number, default: 0 }, // Balance in cents (1 dollar/naira = 100 cents)
      dailyLimit: { type: Number, default: 10000 * 100 }, // $10k/₦10k in cents
      monthlyLimit: { type: Number, default: 100000 * 100 }, // $100k/₦100k
      dailySpent: { type: Number, default: 0 }, // Spent today
      monthlySpent: { type: Number, default: 0 }, // Spent this month
      lastResetDaily: { type: Date, default: Date.now }, // Last reset of daily limit
      lastResetMonthly: { type: Date, default: Date.now }, // Last reset of monthly limit
    }
  ],
  
  // Legacy multicurrency support (keeping for backward compatibility)
  multicurrencyBalances: [{
    currency: String,
    balance: { type: Number, default: 0 },
  }],
  
  // Primary transaction limits (legacy, for backward compatibility)
  dailyLimit: { type: Number, default: 10000 * 100 }, // $10k in cents
  monthlyLimit: { type: Number, default: 100000 * 100 }, // $100k
  
  // For Chimoney integration
  chimoneySubAccountId: String,
  chimoneyUsdAccountId: String, // For USD transactions
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Method to get wallet by currency
walletSchema.methods.getWallet = function(currency) {
  return this.wallets.find(w => w.currency === currency);
};

// Method to get or create wallet for currency
walletSchema.methods.getOrCreateWallet = function(currency) {
  let wallet = this.wallets.find(w => w.currency === currency);
  if (!wallet) {
    wallet = {
      currency,
      balance: 0,
      dailyLimit: 10000 * 100,
      monthlyLimit: 100000 * 100,
      dailySpent: 0,
      monthlySpent: 0,
      lastResetDaily: new Date(),
      lastResetMonthly: new Date(),
    };
    this.wallets.push(wallet);
  }
  return wallet;
};

// Method to add funds to a wallet
walletSchema.methods.addFunds = function(currency, amount) {
  const wallet = this.getOrCreateWallet(currency);
  wallet.balance += amount;
  // Also update primary balance for backward compatibility
  if (currency === this.currency) {
    this.balance = wallet.balance;
  }
};

// Method to deduct funds from a wallet
walletSchema.methods.deductFunds = function(currency, amount) {
  const wallet = this.getOrCreateWallet(currency);
  if (wallet.balance < amount) {
    throw new Error(`Insufficient balance in ${currency} wallet`);
  }
  wallet.balance -= amount;
  // Also update primary balance for backward compatibility
  if (currency === this.currency) {
    this.balance = wallet.balance;
  }
};

// Method to check and update spent limits
walletSchema.methods.updateSpentLimits = function(currency, amount) {
  const wallet = this.getOrCreateWallet(currency);
  const now = new Date();
  
  // Reset daily limit if needed (new day)
  const lastDaily = new Date(wallet.lastResetDaily);
  if (now.getDate() !== lastDaily.getDate() || 
      now.getMonth() !== lastDaily.getMonth() || 
      now.getFullYear() !== lastDaily.getFullYear()) {
    wallet.dailySpent = 0;
    wallet.lastResetDaily = now;
  }
  
  // Reset monthly limit if needed (new month)
  const lastMonthly = new Date(wallet.lastResetMonthly);
  if (now.getMonth() !== lastMonthly.getMonth() || 
      now.getFullYear() !== lastMonthly.getFullYear()) {
    wallet.monthlySpent = 0;
    wallet.lastResetMonthly = now;
  }
  
  wallet.dailySpent += amount;
  wallet.monthlySpent += amount;
};

module.exports = mongoose.model('Wallet', walletSchema);
