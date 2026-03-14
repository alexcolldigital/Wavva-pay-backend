const axios = require('axios');
const logger = require('../utils/logger');
const EventEmitter = require('events');

const WEMA_BASE_URL = process.env.WEMA_BASE_URL || 'https://wema-alatdev-apimgt.developer.azure-api.net/apis';
const WEMA_API_KEY = process.env.WEMA_API_KEY;
const WEMA_SECRET_KEY = process.env.WEMA_SECRET_KEY;
const WEMA_MERCHANT_ID = process.env.WEMA_MERCHANT_ID;

class WemaRealtimeService extends EventEmitter {
  constructor() {
    super();
    this.client = axios.create({
      baseURL: WEMA_BASE_URL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WEMA_API_KEY}`,
        'X-API-Key': WEMA_API_KEY,
        'X-Merchant-ID': WEMA_MERCHANT_ID
      }
    });
  }

  // ============================================
  // Account & Wallet Operations
  // ============================================

  async createUserAccount(userId, email, firstName, lastName, phoneNumber) {
    try {
      const payload = {
        customerId: userId,
        email,
        firstName,
        lastName,
        phoneNumber,
        accountType: 'personal',
        currency: 'NGN'
      };

      const response = await this.client.post('/accounts/create', payload);
      const account = response.data.data;

      this.emit('account:created', {
        userId,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        status: 'active',
        timestamp: new Date()
      });

      return {
        success: true,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        bankCode: '035',
        bankName: 'Wema Bank',
        accountId: account.id
      };
    } catch (err) {
      logger.error('Wema createUserAccount error:', err.message);
      this.emit('account:error', { userId, error: err.message });
      throw err;
    }
  }

  async getWalletBalance(accountId) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/balance`);
      const balance = response.data.data;

      this.emit('balance:fetched', {
        accountId,
        balance: balance.availableBalance,
        ledgerBalance: balance.ledgerBalance,
        timestamp: new Date()
      });

      return {
        success: true,
        availableBalance: balance.availableBalance,
        ledgerBalance: balance.ledgerBalance,
        currency: 'NGN'
      };
    } catch (err) {
      logger.error('Wema getWalletBalance error:', err.message);
      throw err;
    }
  }

  async getLedgerHistory(accountId, limit = 50, offset = 0) {
    try {
      const response = await this.client.get(`/accounts/${accountId}/ledger`, {
        params: { limit, offset }
      });

      const transactions = response.data.data;

      this.emit('ledger:fetched', {
        accountId,
        count: transactions.length,
        timestamp: new Date()
      });

      return {
        success: true,
        transactions: transactions.map(t => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          balance: t.balance,
          narration: t.narration,
          timestamp: t.timestamp
        })),
        total: transactions.length
      };
    } catch (err) {
      logger.error('Wema getLedgerHistory error:', err.message);
      throw err;
    }
  }

  async lookupAccount(accountNumber, bankCode = '035') {
    try {
      const response = await this.client.post('/accounts/lookup', {
        accountNumber,
        bankCode
      });

      const account = response.data.data;

      return {
        success: true,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        bankCode: account.bankCode,
        status: account.status
      };
    } catch (err) {
      logger.error('Wema lookupAccount error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ============================================
  // KYC & Verification
  // ============================================

  async verifyBVN(bvn, firstName, lastName) {
    try {
      const payload = {
        bvn,
        firstName,
        lastName
      };

      const response = await this.client.post('/kyc/verify-bvn', payload);
      const result = response.data.data;

      this.emit('kyc:bvn-verified', {
        bvn: bvn.slice(-4),
        status: result.status,
        tier: result.tier,
        timestamp: new Date()
      });

      return {
        success: result.status === 'verified',
        status: result.status,
        tier: result.tier,
        firstName: result.firstName,
        lastName: result.lastName,
        dateOfBirth: result.dateOfBirth
      };
    } catch (err) {
      logger.error('Wema verifyBVN error:', err.message);
      this.emit('kyc:error', { type: 'bvn', error: err.message });
      throw err;
    }
  }

  async verifyNIN(nin, firstName, lastName) {
    try {
      const payload = {
        nin,
        firstName,
        lastName
      };

      const response = await this.client.post('/kyc/verify-nin', payload);
      const result = response.data.data;

      this.emit('kyc:nin-verified', {
        nin: nin.slice(-4),
        status: result.status,
        tier: result.tier,
        timestamp: new Date()
      });

      return {
        success: result.status === 'verified',
        status: result.status,
        tier: result.tier,
        firstName: result.firstName,
        lastName: result.lastName,
        dateOfBirth: result.dateOfBirth
      };
    } catch (err) {
      logger.error('Wema verifyNIN error:', err.message);
      this.emit('kyc:error', { type: 'nin', error: err.message });
      throw err;
    }
  }

  async checkNameMatch(firstName, lastName, bvn) {
    try {
      const response = await this.client.post('/kyc/name-check', {
        firstName,
        lastName,
        bvn
      });

      const result = response.data.data;

      return {
        success: result.match === true,
        match: result.match,
        matchPercentage: result.matchPercentage,
        message: result.message
      };
    } catch (err) {
      logger.error('Wema checkNameMatch error:', err.message);
      throw err;
    }
  }

  async getTierLimits(accountId) {
    try {
      const response = await this.client.get(`/kyc/tier-limits/${accountId}`);
      const limits = response.data.data;

      return {
        success: true,
        tier: limits.tier,
        dailyLimit: limits.dailyLimit,
        monthlyLimit: limits.monthlyLimit,
        transactionLimit: limits.transactionLimit,
        accountLimit: limits.accountLimit
      };
    } catch (err) {
      logger.error('Wema getTierLimits error:', err.message);
      throw err;
    }
  }

  // ============================================
  // Transfers
  // ============================================

  async initiateNIPTransfer(sourceAccountId, destinationAccountNumber, destinationBankCode, amount, narration) {
    try {
      const reference = `NIP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        destinationAccountNumber,
        destinationBankCode,
        amount: Math.round(amount),
        narration: narration || 'Wavva Pay Transfer',
        reference,
        currency: 'NGN'
      };

      const response = await this.client.post(`/accounts/${sourceAccountId}/transfer`, payload);
      const transfer = response.data.data;

      this.emit('transfer:initiated', {
        transferId: transfer.id,
        reference,
        amount,
        status: transfer.status,
        timestamp: new Date()
      });

      return {
        success: true,
        transferId: transfer.id,
        reference,
        status: transfer.status,
        amount
      };
    } catch (err) {
      logger.error('Wema initiateNIPTransfer error:', err.message);
      this.emit('transfer:error', { error: err.message });
      throw err;
    }
  }

  async initiateInternalTransfer(sourceAccountId, destinationAccountId, amount, narration) {
    try {
      const reference = `INT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        destinationAccountId,
        amount: Math.round(amount),
        narration: narration || 'Internal Transfer',
        reference,
        currency: 'NGN'
      };

      const response = await this.client.post(`/accounts/${sourceAccountId}/internal-transfer`, payload);
      const transfer = response.data.data;

      this.emit('transfer:internal', {
        transferId: transfer.id,
        reference,
        amount,
        status: transfer.status,
        timestamp: new Date()
      });

      return {
        success: true,
        transferId: transfer.id,
        reference,
        status: transfer.status,
        amount
      };
    } catch (err) {
      logger.error('Wema initiateInternalTransfer error:', err.message);
      throw err;
    }
  }

  async getTransferStatus(transferId) {
    try {
      const response = await this.client.get(`/transfers/${transferId}`);
      const transfer = response.data.data;

      this.emit('transfer:status-checked', {
        transferId,
        status: transfer.status,
        timestamp: new Date()
      });

      return {
        success: true,
        transferId,
        status: transfer.status,
        amount: transfer.amount,
        reference: transfer.reference,
        dateCreated: transfer.dateCreated
      };
    } catch (err) {
      logger.error('Wema getTransferStatus error:', err.message);
      throw err;
    }
  }

  // ============================================
  // Funding via Bank Transfer
  // ============================================

  async generateFundingReference(accountId, amount) {
    try {
      const reference = `FUND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        amount: Math.round(amount),
        reference,
        currency: 'NGN'
      };

      const response = await this.client.post(`/accounts/${accountId}/funding-reference`, payload);
      const result = response.data.data;

      this.emit('funding:reference-generated', {
        accountId,
        reference,
        amount,
        timestamp: new Date()
      });

      return {
        success: true,
        reference,
        amount,
        expiresAt: result.expiresAt
      };
    } catch (err) {
      logger.error('Wema generateFundingReference error:', err.message);
      throw err;
    }
  }

  // ============================================
  // Transaction Monitoring
  // ============================================

  async checkFraudStatus(transactionId, amount, accountId) {
    try {
      const response = await this.client.post('/monitoring/fraud-check', {
        transactionId,
        amount,
        accountId
      });

      const result = response.data.data;

      this.emit('monitoring:fraud-checked', {
        transactionId,
        riskLevel: result.riskLevel,
        timestamp: new Date()
      });

      return {
        success: true,
        riskLevel: result.riskLevel,
        flagged: result.flagged,
        reason: result.reason
      };
    } catch (err) {
      logger.error('Wema checkFraudStatus error:', err.message);
      throw err;
    }
  }

  async checkTransactionLimits(accountId, amount) {
    try {
      const response = await this.client.post('/monitoring/check-limits', {
        accountId,
        amount
      });

      const result = response.data.data;

      return {
        success: result.allowed,
        allowed: result.allowed,
        remainingDaily: result.remainingDaily,
        remainingMonthly: result.remainingMonthly,
        reason: result.reason
      };
    } catch (err) {
      logger.error('Wema checkTransactionLimits error:', err.message);
      throw err;
    }
  }

  async getTransactionLogs(accountId, limit = 100) {
    try {
      const response = await this.client.get(`/monitoring/logs/${accountId}`, {
        params: { limit }
      });

      const logs = response.data.data;

      return {
        success: true,
        logs: logs.map(log => ({
          id: log.id,
          type: log.type,
          status: log.status,
          amount: log.amount,
          timestamp: log.timestamp,
          details: log.details
        })),
        total: logs.length
      };
    } catch (err) {
      logger.error('Wema getTransactionLogs error:', err.message);
      throw err;
    }
  }
}

module.exports = new WemaRealtimeService();
