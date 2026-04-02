const WalletV2 = require('../../models/WalletV2');
const Ledger = require('../../models/Ledger');
const { v4: uuidv4 } = require('uuid');

class WalletService {
  // Create a new wallet
  static async createWallet(data) {
    try {
      const walletId = `WALLET-${data.type}-${Date.now()}-${uuidv4().split('-')[0].toUpperCase()}`;

      const wallet = new WalletV2({
        ...data,
        walletId,
        name: data.name || this.generateWalletName(data.type, data.userId)
      });

      return await wallet.save();
    } catch (error) {
      throw new Error(`Failed to create wallet: ${error.message}`);
    }
  }

  // Get wallet by ID
  static async getWallet(walletId) {
    try {
      return await WalletV2.findOne({ walletId });
    } catch (error) {
      throw new Error(`Failed to get wallet: ${error.message}`);
    }
  }

  // Get user wallet
  static async getUserWallet(userId, currency = 'NGN') {
    try {
      return await WalletV2.getUserWallet(userId, currency);
    } catch (error) {
      throw new Error(`Failed to get user wallet: ${error.message}`);
    }
  }

  // Get system wallets
  static async getCommissionWallet(currency = 'NGN') {
    try {
      return await WalletV2.getCommissionWallet(currency);
    } catch (error) {
      throw new Error(`Failed to get commission wallet: ${error.message}`);
    }
  }

  static async getSettlementWallet(currency = 'NGN') {
    try {
      return await WalletV2.getSettlementWallet(currency);
    } catch (error) {
      throw new Error(`Failed to get settlement wallet: ${error.message}`);
    }
  }

  static async getProviderWallet(provider, currency = 'NGN') {
    try {
      return await WalletV2.getProviderWallet(provider, currency);
    } catch (error) {
      throw new Error(`Failed to get provider wallet: ${error.message}`);
    }
  }

  static async getAdminWallet(currency = 'NGN') {
    try {
      return await WalletV2.getAdminWallet(currency);
    } catch (error) {
      throw new Error(`Failed to get admin wallet: ${error.message}`);
    }
  }

  // Transfer between wallets
  static async transfer(fromWalletId, toWalletId, amount, metadata = {}) {
    const session = await WalletV2.startSession();
    session.startTransaction();

    try {
      const fromWallet = await WalletV2.findOne({ walletId: fromWalletId }).session(session);
      const toWallet = await WalletV2.findOne({ walletId: toWalletId }).session(session);

      if (!fromWallet || !toWallet) {
        throw new Error('Wallet not found');
      }

      if (!fromWallet.canTransact(amount)) {
        throw new Error('Insufficient funds or transaction not allowed');
      }

      // Debit from source wallet
      fromWallet.balance -= amount;
      fromWallet.dailySpent += amount;
      fromWallet.monthlySpent += amount;

      // Credit to destination wallet
      toWallet.balance += amount;

      await fromWallet.save({ session });
      await toWallet.save({ session });

      // Create ledger entries
      const ledgerEntry = await Ledger.createEntry({
        transactionId: metadata.transactionId,
        reference: metadata.reference || `TRANSFER-${Date.now()}`,
        fromWallet: fromWallet._id,
        toWallet: toWallet._id,
        amount,
        currency: fromWallet.currency,
        type: metadata.type || 'transfer',
        status: 'completed',
        provider: metadata.provider || 'internal',
        userId: metadata.userId,
        merchantId: metadata.merchantId,
        description: metadata.description,
        metadata
      });

      await session.commitTransaction();
      return { fromWallet, toWallet, ledgerEntry };

    } catch (error) {
      await session.abortTransaction();
      throw new Error(`Transfer failed: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  // Credit wallet
  static async creditWallet(walletId, amount, metadata = {}) {
    try {
      const wallet = await WalletV2.findOne({ walletId });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      wallet.balance += amount;
      await wallet.save();

      // Create ledger entry
      const ledgerEntry = await Ledger.createEntry({
        transactionId: metadata.transactionId,
        reference: metadata.reference || `CREDIT-${Date.now()}`,
        toWallet: wallet._id,
        amount,
        currency: wallet.currency,
        type: metadata.type || 'funding',
        status: 'completed',
        provider: metadata.provider || 'internal',
        userId: metadata.userId,
        merchantId: metadata.merchantId,
        description: metadata.description,
        metadata
      });

      return { wallet, ledgerEntry };
    } catch (error) {
      throw new Error(`Credit failed: ${error.message}`);
    }
  }

  // Debit wallet
  static async debitWallet(walletId, amount, metadata = {}) {
    try {
      const wallet = await WalletV2.findOne({ walletId });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      if (!wallet.canTransact(amount)) {
        throw new Error('Insufficient funds or transaction not allowed');
      }

      wallet.balance -= amount;
      wallet.dailySpent += amount;
      wallet.monthlySpent += amount;
      await wallet.save();

      // Create ledger entry
      const ledgerEntry = await Ledger.createEntry({
        transactionId: metadata.transactionId,
        reference: metadata.reference || `DEBIT-${Date.now()}`,
        fromWallet: wallet._id,
        amount,
        currency: wallet.currency,
        type: metadata.type || 'withdrawal',
        status: 'completed',
        provider: metadata.provider || 'internal',
        userId: metadata.userId,
        merchantId: metadata.merchantId,
        description: metadata.description,
        metadata
      });

      return { wallet, ledgerEntry };
    } catch (error) {
      throw new Error(`Debit failed: ${error.message}`);
    }
  }

  // Get wallet balance
  static async getWalletBalance(walletId) {
    try {
      const wallet = await WalletV2.findOne({ walletId });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Also calculate from ledger for verification
      const ledgerBalance = await Ledger.getWalletBalance(wallet._id);

      return {
        walletBalance: wallet.balance,
        ledgerBalance,
        discrepancy: wallet.balance - ledgerBalance
      };
    } catch (error) {
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  // Freeze/unfreeze wallet
  static async freezeWallet(walletId) {
    try {
      const wallet = await WalletV2.findOne({ walletId });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      await wallet.freeze();
      return wallet;
    } catch (error) {
      throw new Error(`Failed to freeze wallet: ${error.message}`);
    }
  }

  static async unfreezeWallet(walletId) {
    try {
      const wallet = await WalletV2.findOne({ walletId });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      await wallet.unfreeze();
      return wallet;
    } catch (error) {
      throw new Error(`Failed to unfreeze wallet: ${error.message}`);
    }
  }

  // Initialize system wallets
  static async initializeSystemWallets() {
    const currencies = ['NGN', 'USD'];
    const systemWallets = [];

    for (const currency of currencies) {
      // Commission Wallet
      let commissionWallet = await WalletV2.getCommissionWallet(currency);
      if (!commissionWallet) {
        commissionWallet = await this.createWallet({
          type: 'COMMISSION_WALLET',
          currency,
          name: `Platform Commission (${currency})`,
          description: 'Holds platform commission fees'
        });
        systemWallets.push(commissionWallet);
      }

      // Settlement Wallet
      let settlementWallet = await WalletV2.getSettlementWallet(currency);
      if (!settlementWallet) {
        settlementWallet = await this.createWallet({
          type: 'SETTLEMENT_WALLET',
          currency,
          name: `Settlement Wallet (${currency})`,
          description: 'Holds funds from payment providers before settlement'
        });
        systemWallets.push(settlementWallet);
      }

      // Admin Wallet
      let adminWallet = await WalletV2.getAdminWallet(currency);
      if (!adminWallet) {
        adminWallet = await this.createWallet({
          type: 'ADMIN_WALLET',
          currency,
          name: `Admin Wallet (${currency})`,
          description: 'Company main wallet for operations'
        });
        systemWallets.push(adminWallet);
      }

      // Provider Wallets
      const providers = ['flutterwave', 'wema'];
      for (const provider of providers) {
        let providerWallet = await WalletV2.getProviderWallet(provider, currency);
        if (!providerWallet) {
          providerWallet = await this.createWallet({
            type: 'PROVIDER_WALLET',
            currency,
            provider,
            name: `${provider.toUpperCase()} Fees (${currency})`,
            description: `Tracks fees charged by ${provider}`
          });
          systemWallets.push(providerWallet);
        }
      }
    }

    return systemWallets;
  }

  // Generate wallet name
  static generateWalletName(type, userId = null) {
    const typeNames = {
      USER_WALLET: 'User Wallet',
      COMMISSION_WALLET: 'Platform Commission',
      SETTLEMENT_WALLET: 'Settlement Account',
      PROVIDER_WALLET: 'Provider Fees',
      ADMIN_WALLET: 'Admin Wallet'
    };

    return typeNames[type] || 'Wallet';
  }
}

module.exports = WalletService;