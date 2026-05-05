const axios = require('axios');
const logger = require('../utils/logger');

const paystackClient = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: {
    'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Get frontend URL based on allowed URLs
const getAllowedFrontendUrls = () => {
  if (process.env.FRONTEND_URLS) {
    return process.env.FRONTEND_URLS.split(',').map(url => url.trim())
  }
  return [process.env.FRONTEND_URL || 'http://localhost:5173']
}

const getFrontendUrl = (requestOrigin = null) => {
  const allowedUrls = getAllowedFrontendUrls()
  
  // If request origin is provided and it's in the allowed list, use it
  if (requestOrigin && allowedUrls.includes(requestOrigin)) {
    return requestOrigin
  }
  
  // Otherwise use the first URL from the list (or default)
  return allowedUrls[0] || process.env.FRONTEND_URL || 'http://localhost:5173'
}

// Initialize payment
const initializePayment = async (email, amount, currency = 'NGN', metadata = {}, requestOrigin = null) => {
  try {
    const frontendUrl = getFrontendUrl(requestOrigin)
    const reference = `WVP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const payload = {
      email,
      amount: Math.round(amount * 100), // Paystack expects amount in kobo for NGN, cents for USD
      currency: currency === 'USD' ? 'USD' : 'NGN',
      reference,
      callback_url: `${frontendUrl}/wallet?payment_status=true`,
      metadata: {
        ...metadata,
        custom_fields: [
          {
            display_name: 'Wallet Funding',
            variable_name: 'wallet_funding',
            value: 'yes'
          }
        ]
      }
    };

    const response = await paystackClient.post('/transaction/initialize', payload);
    
    logger.info(`Paystack payment initialized: ${reference}`);
    return {
      success: true,
      authorizationUrl: response.data.data.authorization_url,
      accessCode: response.data.data.access_code,
      reference,
      email,
      status: response.data.status,
    };
  } catch (err) {
    logger.error('Paystack initializePayment error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Payment initialization failed',
    };
  }
};

// Verify payment
const verifyPayment = async (reference) => {
  try {
    const response = await paystackClient.get(`/transaction/verify/${reference}`);
    
    const data = response.data.data;
    
    if (data.status !== 'success') {
      return {
        success: false,
        error: 'Payment not successful',
        status: data.status,
      };
    }

    return {
      success: true,
      reference: data.reference,
      transactionId: data.id,
      amount: data.amount / (data.currency === 'NGN' ? 100 : 100), // Convert kobo/cents to actual amount
      currency: data.currency || 'NGN',
      status: data.status,
      paymentMethod: data.channel,
      timestamp: data.paid_at,
      customer: {
        email: data.customer.email,
        id: data.customer.id,
      },
    };
  } catch (err) {
    logger.error('Paystack verifyPayment error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Verification failed',
    };
  }
};

// Get transaction details
const getTransactionDetails = async (reference) => {
  try {
    const response = await paystackClient.get(`/transaction/verify/${reference}`);
    const data = response.data.data;
    
    return {
      success: true,
      reference: data.reference,
      transactionId: data.id,
      amount: data.amount / 100,
      currency: data.currency || 'NGN',
      status: data.status,
      paymentMethod: data.channel,
      customer: {
        email: data.customer.email,
        name: `${data.customer.first_name} ${data.customer.last_name}`.trim(),
        customerId: data.customer.id,
      },
      timestamp: data.paid_at,
    };
  } catch (err) {
    logger.error('Paystack getTransactionDetails error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Failed to fetch transaction',
    };
  }
};

// Create transfer (for withdrawals)
const createTransfer = async (recipient_code, amount, reason = 'Wallet withdrawal') => {
  try {
    const payload = {
      source: 'balance',
      recipient: recipient_code,
      amount: Math.round(amount * 100), // Convert to kobo
      reason,
      reference: `WTH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    const response = await paystackClient.post('/transfer', payload);
    
    return {
      success: true,
      transferId: response.data.data.id,
      reference: payload.reference,
      status: response.data.status,
    };
  } catch (err) {
    logger.error('Paystack createTransfer error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Transfer failed',
    };
  }
};

// Get transfer status
const getTransferStatus = async (transferId) => {
  try {
    const response = await paystackClient.get(`/transfer/${transferId}`);
    
    return {
      success: true,
      transferId: response.data.data.id,
      status: response.data.data.status,
      amount: response.data.data.amount / 100,
    };
  } catch (err) {
    logger.error('Paystack getTransferStatus error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Failed to fetch transfer status',
    };
  }
};

// Create transfer recipient (for bank account)
const createTransferRecipient = async (account_number, account_bank, account_name, type = 'nuban') => {
  try {
    const payload = {
      type,
      account_number,
      bank_code: account_bank,
      name: account_name,
    };

    const response = await paystackClient.post('/transferrecipient', payload);
    
    return {
      success: true,
      recipientCode: response.data.data.recipient_code,
      recipientId: response.data.data.id,
    };
  } catch (err) {
    logger.error('Paystack createTransferRecipient error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Failed to create recipient',
    };
  }
};

// Get list of banks
const getBankList = async () => {
  // Comprehensive fallback list of Nigerian banks supported by Paystack
  const fallbackBanks = [
    { id: 1, code: '044', name: 'Access Bank' },
    { id: 2, code: '050', name: 'Ecobank Nigeria' },
    { id: 3, code: '011', name: 'First Bank of Nigeria' },
    { id: 4, code: '058', name: 'Fidelity Bank' },
    { id: 5, code: '070', name: 'Fidelity Bank' },
    { id: 6, code: '215', name: 'Guaranty Trust Bank (GTB)' },
    { id: 7, code: '012', name: 'IBTC Bank' },
    { id: 8, code: '082', name: 'Keystone Bank' },
    { id: 9, code: '526', name: 'Polaris Bank' },
    { id: 10, code: '090', name: 'Mainstreet Bank' },
    { id: 11, code: '100', name: 'SunTrust Bank' },
    { id: 12, code: '033', name: 'United Bank for Africa (UBA)' },
    { id: 13, code: '035', name: 'Wema Bank' },
    { id: 14, code: '057', name: 'Zenith Bank' },
    { id: 15, code: '060', name: 'FCMB Bank' },
    { id: 16, code: '063', name: 'Diamond Bank' },
    { id: 17, code: '069', name: 'Standard Chartered Bank' },
    { id: 18, code: '076', name: 'Skye Bank' },
    { id: 19, code: '101', name: 'Providus Bank' },
    { id: 20, code: '103', name: 'Titan Trust Bank' },
    { id: 21, code: '102', name: 'Stanbic IBTC Bank' },
    { id: 22, code: '104', name: 'Globus Bank' },
    { id: 23, code: '105', name: 'Jaiz Bank' },
    { id: 24, code: '106', name: 'Lotus Bank' },
    { id: 25, code: '107', name: 'First City Monument Bank (FCMB)' },
    { id: 26, code: '108', name: 'Mezzanine Finance' },
    { id: 27, code: '109', name: 'Infinity Bank' },
    { id: 28, code: '110', name: 'Zenith Bank (Old)' },
    { id: 29, code: '111', name: 'NIFC' },
    { id: 30, code: '112', name: 'Access Bank (Old)' },
  ];

  try {
    const response = await paystackClient.get('/bank', {
      params: {
        country: 'NG',
        perPage: 500, // Request more banks to ensure we get all
      }
    });
    
    if (response.data && response.data.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
      const banks = response.data.data.map(bank => ({
        id: bank.id,
        code: bank.code,
        name: bank.name,
      }));
      
      logger.info(`Successfully fetched ${banks.length} banks from Paystack`);
      
      return {
        success: true,
        banks: banks,
        source: 'paystack',
      };
    } else {
      // Response is empty, use fallback
      logger.warn('Paystack API returned empty bank list, using fallback');
      return {
        success: true,
        banks: fallbackBanks,
        source: 'fallback',
      };
    }
  } catch (err) {
    logger.warn('Paystack getBankList API error, using fallback list:', err.response?.data?.message || err.message);
    
    return {
      success: true,
      banks: fallbackBanks,
      source: 'fallback',
    };
  }
};

// Resolve bank account
const resolveBankAccount = async (account_number, bank_code) => {
  try {
    const response = await paystackClient.get('/bank/resolve', {
      params: {
        account_number,
        bank_code,
      }
    });
    
    const data = response.data.data;
    return {
      success: true,
      accountName: data.account_name,
      accountNumber: data.account_number,
      bankCode: bank_code,
    };
  } catch (err) {
    logger.error('Paystack resolveBankAccount error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Failed to resolve account',
    };
  }
};

module.exports = {
  initializePayment,
  verifyPayment,
  getTransactionDetails,
  createTransfer,
  getTransferStatus,
  createTransferRecipient,
  getBankList,
  resolveBankAccount,
};
