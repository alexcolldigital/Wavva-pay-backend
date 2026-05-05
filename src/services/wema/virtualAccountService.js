// Wema Virtual Account Service
// Handles virtual account creation and management

const wemaApiClient = require('../../utils/wemaApiClient');
const Wallet = require('../../models/Wallet');
const logger = require('../../utils/logger');

module.exports = {
  async createVirtualAccount(userId, userDetails) {
    try {
      const {
        firstName,
        lastName,
        email,
        phoneNumber,
        bvn
      } = userDetails;

      // Prepare payload for Virtual Account creation
      const payload = {
        customerName: `${firstName} ${lastName}`,
        customerEmail: email,
        customerPhone: phoneNumber,
        bvn: bvn,
        accountType: 'WALLET',
        currencyCode: 'NGN',
        reference: `WAVVA_VA_${userId}_${Date.now()}`
      };

      // Call Wema Virtual Account API
      // Based on ALAT Virtual Account API documentation
      const response = await wemaApiClient.post('/VirtualAccount/api/v1/Prefix/CreateNew', payload);

      if (response.data && response.data.success) {
        const virtualAccount = response.data.data;

        // Update wallet with virtual account details
        await Wallet.findOneAndUpdate(
          { userId },
          {
            virtualAccountNumber: virtualAccount.accountNumber,
            virtualAccountName: virtualAccount.accountName,
            virtualAccountBank: 'Wema Bank',
            virtualAccountReference: payload.reference,
            wemaVirtualAccountId: virtualAccount.id
          },
          { upsert: true }
        );

        return {
          success: true,
          data: {
            accountNumber: virtualAccount.accountNumber,
            accountName: virtualAccount.accountName,
            bankName: 'Wema Bank',
            reference: payload.reference
          }
        };
      } else {
        throw new Error(response.data?.message || 'Virtual account creation failed');
      }

    } catch (error) {
      logger.error('Virtual Account Creation Error:', error.message);
      throw error;
    }
  },

  async getVirtualAccount(userId) {
    try {
      const wallet = await Wallet.findOne({ userId });

      if (!wallet || !wallet.virtualAccountNumber) {
        return {
          success: false,
          message: 'No virtual account found for user'
        };
      }

      return {
        success: true,
        data: {
          accountNumber: wallet.virtualAccountNumber,
          accountName: wallet.virtualAccountName,
          bankName: wallet.virtualAccountBank,
          reference: wallet.virtualAccountReference
        }
      };

    } catch (error) {
      logger.error('Get Virtual Account Error:', error.message);
      throw error;
    }
  },

  async getVirtualAccountTransactions(userId, startDate, endDate) {
    try {
      const wallet = await Wallet.findOne({ userId });

      if (!wallet || !wallet.wemaVirtualAccountId) {
        throw new Error('No virtual account found for user');
      }

      const params = {
        accountId: wallet.wemaVirtualAccountId,
        startDate,
        endDate
      };

      const response = await wemaApiClient.get('/VirtualAccount/api/v1/Trans/TransQuery', { params });

      return {
        success: true,
        data: response.data?.data || []
      };

    } catch (error) {
      logger.error('Get Virtual Account Transactions Error:', error.message);
      throw error;
    }
  },

  async handleVirtualAccountWebhook(payload) {
    try {
      // Process webhook from Wema for virtual account transactions
      const {
        accountNumber,
        amount,
        transactionReference,
        transactionType,
        narration
      } = payload;

      // Find wallet by virtual account number
      const wallet = await Wallet.findOne({ virtualAccountNumber: accountNumber });

      if (!wallet) {
        logger.warn('Virtual account webhook: Account not found', accountNumber);
        return { success: false, message: 'Account not found' };
      }

      if (transactionType === 'CREDIT') {
        // Credit wallet
        wallet.balance += parseFloat(amount);
        await wallet.save();

        // Log transaction
        const Transaction = require('../../models/Transaction');
        const transaction = new Transaction({
          userId: wallet.userId,
          type: 'credit',
          amount: parseFloat(amount),
          description: narration || 'Virtual Account Credit',
          reference: transactionReference,
          status: 'completed',
          metadata: payload
        });
        await transaction.save();

        logger.info('Virtual account credited:', { accountNumber, amount, reference: transactionReference });
      }

      return { success: true };

    } catch (error) {
      logger.error('Virtual Account Webhook Error:', error.message);
      throw error;
    }
  }
};