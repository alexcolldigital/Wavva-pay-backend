// Wema Settlement/Holding Account Service
// Handles settlement account management and balance inquiries

const wemaApiClient = require('../../utils/wemaApiClient');
const logger = require('../../utils/logger');

module.exports = {
  async getSettlementAccount() {
    try {
      // Get settlement account details from environment or API
      const settlementAccount = {
        accountNumber: process.env.WEMA_SETTLEMENT_ACCOUNT_NUMBER,
        accountName: process.env.WEMA_SETTLEMENT_ACCOUNT_NAME || 'Wavva Pay Settlement',
        bankName: 'Wema Bank',
        bankCode: '035'
      };

      // Optionally call Wema API to get real-time balance
      try {
        const response = await wemaApiClient.get(`/accountmaintenance/v1/accounts/${settlementAccount.accountNumber}/balance`);

        if (response.data && response.data.success) {
          settlementAccount.balance = response.data.data?.availableBalance;
          settlementAccount.ledgerBalance = response.data.data?.ledgerBalance;
        }
      } catch (balanceError) {
        logger.warn('Could not fetch settlement account balance:', balanceError.message);
      }

      return {
        success: true,
        data: settlementAccount
      };

    } catch (error) {
      logger.error('Get Settlement Account Error:', error.message);
      throw error;
    }
  },

  async getSettlementTransactions(startDate, endDate) {
    try {
      const settlementAccountNumber = process.env.WEMA_SETTLEMENT_ACCOUNT_NUMBER;

      if (!settlementAccountNumber) {
        throw new Error('Settlement account not configured');
      }

      const params = {
        accountNumber: settlementAccountNumber,
        startDate,
        endDate,
        pageSize: 100
      };

      const response = await wemaApiClient.get('/accountmaintenance/v1/transactions', { params });

      return {
        success: true,
        data: response.data?.data || []
      };

    } catch (error) {
      logger.error('Get Settlement Transactions Error:', error.message);
      throw error;
    }
  },

  async transferToSettlement(amount, sourceAccount, narration = 'Settlement Transfer') {
    try {
      const payload = {
        debitAccountNumber: sourceAccount,
        creditAccountNumber: process.env.WEMA_SETTLEMENT_ACCOUNT_NUMBER,
        amount: parseFloat(amount),
        narration,
        transactionReference: `WAVVA_SETT_${Date.now()}`,
        currencyCode: 'NGN'
      };

      const response = await wemaApiClient.post('/fundstransferopenapi/v1/transfers', payload);

      return {
        success: true,
        data: response.data?.data
      };

    } catch (error) {
      logger.error('Settlement Transfer Error:', error.message);
      throw error;
    }
  }
};