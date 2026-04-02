// Wallet Service
// Handles wallet operations including virtual account creation

const Wallet = require('../models/Wallet');
const User = require('../models/User');
const UserKYC = require('../models/UserKYC');
const FlutterwaveService = require('../modules/flutterwave/flutterwaveService');
const logger = require('../utils/logger');

const flutterwaveService = new FlutterwaveService();

class WalletService {
  // Create virtual account for user automatically
  async createVirtualAccountForUser(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const userKYC = await UserKYC.findOne({ userId });

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

      // Virtual Account can be created without KYC
      // KYC is only needed to increase limits, not to create VA
      const kycIdType = (userKYC?.idType || user?.kyc?.idType || '').toLowerCase();
      const kycIdNumber = userKYC?.idNumber || user?.kyc?.idNumber;
      const identityNumber = user.bvn || user.nin || ((kycIdType === 'bvn' || kycIdType === 'nin' || kycIdType === 'national_id') ? kycIdNumber : null);

      const reference = `WAVVA_VA_${userId}_${Date.now()}`;
      const vaPayload = {
        email: user.email,
        amount: 0,
        tx_ref: reference,
        narration: `WavvaPay virtual account for ${user.firstName || ''} ${user.lastName || ''}`.trim(),
        is_permanent: false, // Start with temporary, upgrade to permanent with KYC
      };

      // Add KYC data if available (user completed tier 2)
      // This allows for permanent VA immediately if KYC is provided
      if (identityNumber) {
        vaPayload.is_permanent = true;
        if (user.bvn || kycIdType === 'bvn') {
          vaPayload.bvn = user.bvn || kycIdNumber;
        } else {
          vaPayload.nin = user.nin || kycIdNumber;
        }
      }

      let virtualAccountResult;
      try {
        virtualAccountResult = await flutterwaveService.createVirtualAccount(vaPayload);
      } catch (flutterwaveError) {
        // Flutterwave requires BVN/NIN for VA creation, even temporary
        // If user doesn't have it, skip VA for now and return graceful response
        if (flutterwaveError.message?.includes('BVN') || flutterwaveError.message?.includes('NIN')) {
          logger.warn(`Skipping virtual account creation for user ${userId}: ${flutterwaveError.message}`);
          await wallet.save();
          return {
            success: true,
            message: 'Wallet created. Virtual account requires KYC verification for full features.',
            data: {
              accountNumber: null,
              accountName: null,
              bankName: null,
              reference: null,
              status: 'pending_kyc',
              isPermanent: false,
            },
            requiresKYC: true
          };
        }
        // If it's a different error, throw it
        throw flutterwaveError;
      }

      if (!virtualAccountResult || virtualAccountResult.status !== 'success' || !virtualAccountResult.data) {
        throw new Error(virtualAccountResult?.message || 'Failed to create virtual account');
      }

      const accountData = virtualAccountResult.data;

      wallet.virtualAccountNumber = accountData.account_number;
      wallet.virtualAccountName = accountData.account_name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
      wallet.virtualAccountBank = accountData.bank_name || 'Flutterwave';
      wallet.virtualAccountReference = accountData.tx_ref || reference;
      wallet.virtualAccountStatus = accountData.is_permanent ? 'active' : 'inactive';
      wallet.flutterwaveSubAccountId = accountData.id ? String(accountData.id) : undefined;
      wallet.flutterwaveAccountReference = wallet.virtualAccountReference;

      await wallet.save();

      logger.info(`Virtual account created for user ${userId}: ${wallet.virtualAccountNumber}`);

      return {
        success: true,
        data: {
          accountNumber: wallet.virtualAccountNumber,
          accountName: wallet.virtualAccountName,
          bankName: wallet.virtualAccountBank,
          reference: wallet.virtualAccountReference,
          status: wallet.virtualAccountStatus,
          isPermanent: accountData.is_permanent,
        }
      };

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
      // VA is always created, KYC only determines if permanent or temporary
      if (!wallet.virtualAccountNumber) {
        const vaResult = await this.createVirtualAccountForUser(userId);
        if (vaResult?.success) {
          await wallet.reload();
        }
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