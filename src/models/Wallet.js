const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  
  // Primary balance (legacy, for backward compatibility)
  balance: { type: Number, default: 0 }, // Main balance in cents
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  
  // Wallets with multi-currency and purpose support
  wallets: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      currency: { type: String, enum: ['USD', 'NGN'], required: true },
      purpose: { 
        type: String, 
        enum: ['general', 'savings', 'bills', 'spending', 'investment', 'emergency'], 
        default: 'general' 
      }, // Purpose of the wallet
      name: String, // Custom name for the wallet (e.g., "Monthly Savings")
      balance: { type: Number, default: 0 }, // Balance in cents (1 dollar/naira = 100 cents)
      dailyLimit: { type: Number, default: 10000 * 100 }, // $10k/₦10k in cents
      monthlyLimit: { type: Number, default: 100000 * 100 }, // $100k/₦100k
      dailySpent: { type: Number, default: 0 }, // Spent today
      monthlySpent: { type: Number, default: 0 }, // Spent this month
      lastResetDaily: { type: Date, default: Date.now }, // Last reset of daily limit
      lastResetMonthly: { type: Date, default: Date.now }, // Last reset of monthly limit
      isActive: { type: Boolean, default: true }, // Whether this wallet is active
      createdAt: { type: Date, default: Date.now },
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
  
  // Wema Virtual Account Integration
  virtualAccountNumber: String,
  virtualAccountName: String,
  virtualAccountBank: { type: String, default: 'Wema Bank' },
  virtualAccountReference: String,
  wemaVirtualAccountId: String, // Wema's internal ID
  virtualAccountStatus: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  
  // Flutterwave Integration
  flutterwaveSubAccountId: String,
  flutterwaveAccountReference: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Method to get wallet by currency
walletSchema.methods.getWallet = function(currency) {
  return this.wallets.find(w => w.currency === currency);
};

// Method to get wallet by currency and purpose
walletSchema.methods.getWalletByPurpose = function(currency, purpose = 'general') {
  return this.wallets.find(w => w.currency === currency && w.purpose === purpose && w.isActive);
};

// Method to get or create wallet for currency with optional purpose
walletSchema.methods.getOrCreateWallet = function(currency, purpose = 'general', name = null) {
  let wallet = this.wallets.find(w => w.currency === currency && w.purpose === purpose && w.isActive);
  if (!wallet) {
    wallet = {
      currency,
      purpose,
      name: name || `${purpose.charAt(0).toUpperCase() + purpose.slice(1)} ${currency}`,
      balance: 0,
      dailyLimit: 10000 * 100,
      monthlyLimit: 100000 * 100,
      dailySpent: 0,
      monthlySpent: 0,
      lastResetDaily: new Date(),
      lastResetMonthly: new Date(),
      isActive: true,
      createdAt: new Date(),
    };
    this.wallets.push(wallet);
  }
  return wallet;
};

// Method to get all wallets for a currency
walletSchema.methods.getWalletsByCurrency = function(currency) {
  return this.wallets.filter(w => w.currency === currency && w.isActive);
};

// Method to get all wallets for a purpose
walletSchema.methods.getWalletsByPurpose = function(purpose) {
  return this.wallets.filter(w => w.purpose === purpose && w.isActive);
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
