// Wallet Service
// Handles wallet operations including virtual account creation

const Wallet = require('../models/Wallet');
const User = require('../models/User');
const wemaVirtualAccountService = require('./wema/virtualAccountService');
const logger = require('../utils/logger');

class WalletService {
  // Create virtual account for user automatically
  async createVirtualAccountForUser(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        throw new Error('Wallet not found for user');
      }

      // Check if virtual account already exists
      if (wallet.virtualAccountNumber) {
        return {
          success: true,
          message: 'Virtual account already exists',
          data: {
            accountNumber: wallet.virtualAccountNumber,
            accountName: wallet.virtualAccountName,
            bankName: wallet.virtualAccountBank
          }
        };
      }

      // Create virtual account using Wema
      const virtualAccountData = {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        bvn: user.bvn || null // BVN might not be available during registration
      };

      const result = await wemaVirtualAccountService.createVirtualAccount(userId, virtualAccountData);

      if (result.success) {
        // Update wallet with virtual account details
        wallet.virtualAccountNumber = result.data.accountNumber;
        wallet.virtualAccountName = result.data.accountName;
        wallet.virtualAccountReference = result.data.reference;
        await wallet.save();

        logger.info(`Virtual account created for user ${userId}: ${result.data.accountNumber}`);

        return result;
      } else {
        throw new Error(result.message || 'Failed to create virtual account');
      }

    } catch (error) {
      logger.error('Create Virtual Account Error:', error);
      throw error;
    }
  }

  // Get wallet with virtual account details
  async getWalletWithVirtualAccount(userId) {
    try {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Ensure virtual account exists
      if (!wallet.virtualAccountNumber) {
        await this.createVirtualAccountForUser(userId);
        // Re-fetch wallet after creation
        await wallet.reload();
      }

      return {
        success: true,
        data: {
          wallet: wallet,
          virtualAccount: {
            accountNumber: wallet.virtualAccountNumber,
            accountName: wallet.virtualAccountName,
            bankName: wallet.virtualAccountBank,
            reference: wallet.virtualAccountReference,
            status: wallet.virtualAccountStatus
          }
        }
      };

    } catch (error) {
      logger.error('Get Wallet with Virtual Account Error:', error);
      throw error;
    }
  }

  // Update wallet balance from virtual account transaction
  async processVirtualAccountTransaction(userId, transactionData) {
    try {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const { amount, type, reference } = transactionData;

      // Update wallet balance
      if (type === 'credit') {
        wallet.balance += amount;
      } else if (type === 'debit') {
        wallet.balance -= amount;
      }

      await wallet.save();

      logger.info(`Wallet balance updated for user ${userId}: ${type} ${amount}`);

      return {
        success: true,
        data: {
          newBalance: wallet.balance,
          transactionType: type,
          amount: amount
        }
      };

    } catch (error) {
      logger.error('Process Virtual Account Transaction Error:', error);
      throw error;
    }
  }
}

module.exports = new WalletService();