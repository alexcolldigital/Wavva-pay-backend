const axios = require('axios');
const logger = require('../utils/logger');

const flutterwaveClient = axios.create({
  baseURL: process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3',
  headers: {
    'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Initialize payment
const initializePayment = async (email, amount, currency = 'NGN', metadata = {}) => {
  try {
    const payload = {
      tx_ref: `WVP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency,
      redirect_url: `${process.env.FRONTEND_URL}/payments/verify`,
      payment_options: 'card,mobilemoney,ussd',
      customer: {
        email,
      },
      customizations: {
        title: 'Wavva Pay - Add Funds',
        description: 'Add funds to your Wavva Pay wallet',
        logo: `${process.env.FRONTEND_URL}/logo.png`,
      },
      meta: metadata,
    };

    const response = await flutterwaveClient.post('/payments', payload);
    
    logger.info(`Payment initialized: ${payload.tx_ref}`);
    return {
      success: true,
      paymentLink: response.data.data.link,
      transactionRef: payload.tx_ref,
      status: response.data.status,
    };
  } catch (err) {
    logger.error('Flutterwave initializePayment error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Payment initialization failed',
    };
  }
};

// Verify payment
const verifyPayment = async (transactionId) => {
  try {
    const response = await flutterwaveClient.get(`/transactions/${transactionId}/verify`);
    
    const data = response.data.data;
    return {
      success: data.status === 'successful',
      transactionId: data.id,
      reference: data.tx_ref,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      paymentMethod: data.payment_type,
      timestamp: data.created_at,
    };
  } catch (err) {
    logger.error('Flutterwave verifyPayment error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Verification failed',
    };
  }
};

// Get transaction details
const getTransactionDetails = async (transactionId) => {
  try {
    const response = await flutterwaveClient.get(`/transactions/${transactionId}`);
    const data = response.data.data;
    
    return {
      success: true,
      transactionId: data.id,
      reference: data.tx_ref,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      paymentMethod: data.payment_type,
      customer: {
        email: data.customer.email,
        name: data.customer.name,
        phone: data.customer.phone_number,
      },
      timestamp: data.created_at,
    };
  } catch (err) {
    logger.error('Flutterwave getTransactionDetails error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Failed to fetch transaction',
    };
  }
};

// Create transfer (for P2P payments)
const createTransfer = async (account_number, account_bank, amount, currency = 'NGN', narrative) => {
  try {
    const payload = {
      account_number,
      account_bank,
      amount,
      currency,
      narrative: narrative || 'Payment from Wavva Pay',
      reference: `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    const response = await flutterwaveClient.post('/transfers', payload);
    
    return {
      success: true,
      transferId: response.data.data.id,
      reference: payload.reference,
      status: response.data.status,
    };
  } catch (err) {
    logger.error('Flutterwave createTransfer error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Transfer failed',
    };
  }
};

// Get transfer status
const getTransferStatus = async (transferId) => {
  try {
    const response = await flutterwaveClient.get(`/transfers/${transferId}`);
    
    return {
      success: true,
      transferId: response.data.data.id,
      status: response.data.data.status,
      amount: response.data.data.amount,
    };
  } catch (err) {
    logger.error('Flutterwave getTransferStatus error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Failed to fetch transfer status',
    };
  }
};

// Resolve bank account details
const resolveBankAccount = async (account_number, account_bank) => {
  try {
    const response = await flutterwaveClient.get('/accounts/resolve', {
      params: {
        account_number,
        account_bank,
      }
    });
    
    const data = response.data.data;
    return {
      success: true,
      accountName: data.account_name,
      accountNumber: data.account_number,
      accountBank: data.account_bank,
    };
  } catch (err) {
    logger.error('Flutterwave resolveBankAccount error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Failed to resolve account',
    };
  }
};

// Get list of supported banks
const getBankList = async (country = 'NG') => {
  try {
    const response = await flutterwaveClient.get('/banks', {
      params: { country }
    });
    
    const banks = response.data.data;
    return {
      success: true,
      banks: banks.map(bank => ({
        id: bank.id,
        code: bank.code,
        name: bank.name,
      })),
    };
  } catch (err) {
    logger.error('Flutterwave getBankList error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Failed to fetch bank list',
    };
  }
};

// Initiate bank transfer with account verification
const initiateBankTransfer = async (account_number, account_bank, amount, currency = 'NGN', narrative) => {
  try {
    // First, verify the account details
    const verification = await resolveBankAccount(account_number, account_bank);
    
    if (!verification.success) {
      return {
        success: false,
        error: verification.error || 'Account verification failed',
      };
    }

    // If verification succeeds, proceed with transfer
    const payload = {
      account_number,
      account_bank,
      amount,
      currency,
      narrative: narrative || 'Payment from Wavva Pay',
      reference: `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      debit_currency: currency,
    };

    const response = await flutterwaveClient.post('/transfers', payload);
    
    logger.info(`Bank transfer initiated: ${payload.reference}`);
    
    return {
      success: true,
      transferId: response.data.data.id,
      reference: payload.reference,
      status: response.data.data.status,
      accountName: verification.accountName,
      amount: amount,
      currency: currency,
    };
  } catch (err) {
    logger.error('Flutterwave initiateBankTransfer error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Bank transfer failed',
    };
  }
};

module.exports = {
  initializePayment,
  verifyPayment,
  getTransactionDetails,
  createTransfer,
  getTransferStatus,
  resolveBankAccount,
  getBankList,
  initiateBankTransfer,
};
