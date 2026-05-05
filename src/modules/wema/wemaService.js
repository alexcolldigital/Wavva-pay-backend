const axios = require('axios');
const TransactionService = require('../transactions/transactionService');
const crypto = require('crypto');

class WemaWebhookService {
  constructor() {
    this.apiKey = process.env.WEMA_API_KEY;
    this.apiSecret = process.env.WEMA_API_SECRET;
    this.baseURL = process.env.WEMA_BASE_URL || 'https://wema-alatdev-apimgt.developer.azure-api.net';
    this.subscriptionKey = process.env.WEMA_SUBSCRIPTION_KEY;
  }

  // Verify webhook signature
  verifyWebhook(req) {
    const signature = req.headers['x-wema-signature'];
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(payload)
      .digest('hex');

    return signature === expectedSignature;
  }

  // Process webhook
  async processWebhook(webhookData) {
    try {
      const { eventType, data } = webhookData;

      // Only process successful payment events
      if (eventType !== 'PAYMENT_SUCCESS' && eventType !== 'CREDIT') {
        return { success: true, message: 'Event ignored' };
      }

      const {
        reference,
        amount,
        currency = 'NGN',
        accountNumber,
        accountName,
        narration
      } = data;

      // Process settlement
      const settlementResult = await TransactionService.processWebhookSettlement({
        reference,
        amount: Math.round(amount * 100), // Convert to kobo
        currency,
        provider: 'wema',
        providerReference: reference,
        status: 'successful',
        metadata: {
          accountNumber,
          accountName,
          narration,
          webhookData: data
        }
      });

      return settlementResult;

    } catch (error) {
      console.error('Wema webhook processing error:', error);
      throw new Error(`Webhook processing failed: ${error.message}`);
    }
  }

  // Create virtual account
  async createVirtualAccount(accountData) {
    try {
      const response = await axios.post(`${this.baseURL}/virtual-account/create`, {
        accountName: accountData.accountName,
        bvn: accountData.bvn,
        email: accountData.email,
        phoneNumber: accountData.phoneNumber,
        reference: accountData.reference
      }, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'Authorization': `Bearer ${this.getAuthToken()}`,
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
      const response = await axios.post(`${this.baseURL}/transfer`, {
        amount: transferData.amount / 100, // Convert from kobo
        currency: transferData.currency || 'NGN',
        destinationAccount: transferData.account_number,
        destinationBank: transferData.bank_code,
        reference: transferData.reference,
        narration: transferData.narration,
        sourceAccount: transferData.sourceAccount
      }, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Transfer failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get account balance
  async getAccountBalance(accountNumber) {
    try {
      const response = await axios.get(`${this.baseURL}/account/balance/${accountNumber}`, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Balance check failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Verify account
  async verifyAccount(accountNumber, bankCode) {
    try {
      const response = await axios.post(`${this.baseURL}/account/verify`, {
        accountNumber,
        bankCode
      }, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Account verification failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get transaction status
  async getTransactionStatus(reference) {
    try {
      const response = await axios.get(`${this.baseURL}/transaction/status/${reference}`, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Transaction status check failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get banks
  async getBanks() {
    try {
      const response = await axios.get(`${this.baseURL}/banks`, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Get banks failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Generate auth token (simplified - in production, implement proper OAuth)
  getAuthToken() {
    // This should be implemented properly with OAuth flow
    // For now, returning a placeholder
    return `Bearer ${this.apiKey}`;
  }

  // NIP transfer (inter-bank transfer)
  async nipTransfer(transferData) {
    try {
      const response = await axios.post(`${this.baseURL}/nip/transfer`, {
        amount: transferData.amount / 100,
        currency: transferData.currency || 'NGN',
        destinationAccount: transferData.account_number,
        destinationBank: transferData.bank_code,
        reference: transferData.reference,
        narration: transferData.narration,
        sourceAccount: transferData.sourceAccount
      }, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`NIP transfer failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = WemaWebhookService;