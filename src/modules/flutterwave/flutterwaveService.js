const axios = require('axios');
const TransactionService = require('../transactions/transactionService');
const WalletService = require('../wallet/walletService');
const Ledger = require('../models/Ledger');

class FlutterwaveWebhookService {
  constructor() {
    this.secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
    this.baseURL = process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3';
  }

  // Verify webhook signature
  verifyWebhook(req) {
    const secretHash = req.headers['verif-hash'];
    return secretHash === this.secretHash;
  }

  // Process webhook
  async processWebhook(webhookData) {
    try {
      const { event, data } = webhookData;

      // Only process successful charge events
      if (event !== 'charge.completed' || data.status !== 'successful') {
        return { success: true, message: 'Event ignored' };
      }

      const {
        tx_ref,
        amount,
        currency,
        customer: { email },
        payment_type,
        narration
      } = data;

      // Process settlement
      const settlementResult = await TransactionService.processWebhookSettlement({
        reference: tx_ref,
        amount: Math.round(amount * 100), // Convert to kobo
        currency,
        provider: 'flutterwave',
        providerReference: data.id.toString(),
        status: 'successful',
        metadata: {
          email,
          payment_type,
          narration,
          webhookData: data
        }
      });

      return settlementResult;

    } catch (error) {
      console.error('Flutterwave webhook processing error:', error);
      throw new Error(`Webhook processing failed: ${error.message}`);
    }
  }

  // Verify transaction with Flutterwave
  async verifyTransaction(transactionId) {
    try {
      const response = await axios.get(`${this.baseURL}/transactions/${transactionId}/verify`, {
        headers: {
          'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Flutterwave verification failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Create virtual account
  async createVirtualAccount(accountData) {
    try {
      const response = await axios.post(`${this.baseURL}/virtual-account-numbers`, {
        email: accountData.email,
        amount: accountData.amount || 1000000, // 10k NGN default
        tx_ref: accountData.tx_ref,
        narration: accountData.narration || 'WavvaPay Virtual Account',
        is_permanent: accountData.is_permanent || true
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Virtual account creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Transfer funds
  async initiateTransfer(transferData) {
    try {
      const response = await axios.post(`${this.baseURL}/transfers`, {
        account_bank: transferData.bank_code,
        account_number: transferData.account_number,
        amount: transferData.amount / 100, // Convert from kobo to naira
        currency: transferData.currency || 'NGN',
        reference: transferData.reference,
        narration: transferData.narration,
        callback_url: transferData.callback_url
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Transfer failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get banks
  async getBanks(country = 'NG') {
    try {
      const response = await axios.get(`${this.baseURL}/banks/${country}`, {
        headers: {
          'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Get banks failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Bill payments
  async payBill(billData) {
    try {
      const response = await axios.post(`${this.baseURL}/bills`, {
        country: billData.country || 'NG',
        customer: billData.customer,
        amount: billData.amount / 100, // Convert from kobo
        reference: billData.reference,
        type: billData.type, // airtime, data, electricity, etc.
        callback_url: billData.callback_url
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Bill payment failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = FlutterwaveWebhookService;