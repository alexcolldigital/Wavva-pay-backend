// Wema NIP Transfer Service
// Handles interbank/NIP transfers using Funds Transfer OpenAPI

const wemaApiClient = require('../../utils/wemaApiClient');
const Transaction = require('../../models/Transaction');
const Wallet = require('../../models/Wallet');
const logger = require('../../utils/logger');

module.exports = {
  async sendNipTransfer(userId, transferData) {
    try {
      const {
        account_number,
        bank_code,
        amount,
        narration = 'Wavva Pay Transfer',
        pin
      } = transferData;

      // Check if Wema API is properly configured
      const isApiConfigured = process.env.WEMA_SUBSCRIPTION_KEY &&
                             process.env.WEMA_SUBSCRIPTION_KEY !== 'your-wema-subscription-key' &&
                             process.env.WEMA_API_KEY &&
                             process.env.WEMA_API_KEY !== 'your_wema_api_key_here';

      // Validate user wallet balance
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < amount) {
        throw new Error('Insufficient wallet balance');
      }

      // Verify PIN (implement PIN verification logic)
      // const isValidPin = await verifyUserPin(userId, pin);
      // if (!isValidPin) {
      //   throw new Error('Invalid PIN');
      // }

      if (!isApiConfigured) {
        // Mock transfer for development/testing
        logger.warn('Wema API not configured, simulating transfer');

        // Debit wallet
        wallet.balance -= parseFloat(amount);
        await wallet.save();

        // Log transaction
        const transaction = new Transaction({
          userId,
          type: 'debit',
          amount: parseFloat(amount),
          description: `Transfer to ${account_number}`,
          reference: `MOCK_${Date.now()}_${userId}`,
          status: 'completed',
          metadata: {
            recipientAccount: account_number,
            recipientBank: bank_code,
            mockTransfer: true
          }
        });
        await transaction.save();

        return {
          success: true,
          data: {
            transactionId: transaction._id,
            reference: transaction.reference,
            mockTransfer: true
          }
        };
      }

      // Prepare transfer payload for Wema Funds Transfer API
      const payload = {
        debitAccountNumber: wallet.accountNumber, // Your settlement account
        creditAccountNumber: account_number,
        creditBankCode: bank_code,
        amount: parseFloat(amount),
        narration,
        transactionReference: `WAVVA_${Date.now()}_${userId}`,
        currencyCode: 'NGN'
      };

      // Call Wema Funds Transfer OpenAPI
      const response = await wemaApiClient.post('/funds-transfer-open/api/OpenApiTransfer/TransferFunds', payload, process.env.WEMA_OPEN_BANKING_PRODUCT_CODE);

      if (response.data && response.data.success) {
        // Debit wallet
        wallet.balance -= parseFloat(amount);
        await wallet.save();

        // Log transaction
        const transaction = new Transaction({
          userId,
          type: 'debit',
          amount: parseFloat(amount),
          description: `Transfer to ${account_number}`,
          reference: payload.transactionReference,
          status: 'completed',
          metadata: {
            recipientAccount: account_number,
            recipientBank: bank_code,
            wemaReference: response.data.data?.transactionReference
          }
        });
        await transaction.save();

        return {
          success: true,
          data: {
            transactionId: transaction._id,
            reference: payload.transactionReference,
            wemaReference: response.data.data?.transactionReference
          }
        };
      } else {
        throw new Error(response.data?.message || 'Transfer failed');
      }

    } catch (error) {
      logger.error('NIP Transfer Error:', error.message);
      throw error;
    }
  },

  async getTransferStatus(transactionReference) {
    try {
      const response = await wemaApiClient.get(`/fundstransferopenapi/v1/transfers/${transactionReference}`, {}, process.env.WEMA_OPEN_BANKING_PRODUCT_CODE);

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Transfer Status Check Error:', error.message);
      throw error;
    }
  }
};