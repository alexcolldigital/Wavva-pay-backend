const axios = require('axios');
const logger = require('../utils/logger');

const flutterwaveClient = axios.create({
  baseURL: process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3',
  headers: {
    'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
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
    const payload = {
      tx_ref: `WVP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency,
      redirect_url: `${frontendUrl}/wallet?payment_status=true`,
      payment_options: 'card,mobilemoney,ussd',
      customer: {
        email,
      },
      customizations: {
        title: 'Wavva Pay - Add Funds',
        description: 'Add funds to your Wavva Pay wallet',
        logo: `${frontendUrl}/logo.png`,
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
  // Fallback to a default list of Nigerian banks
  const fallbackBanks = [
    { id: 1, code: '044', name: 'Access Bank' },
    { id: 2, code: '050', name: 'Ecobank Nigeria' },
    { id: 3, code: '011', name: 'First Bank of Nigeria' },
    { id: 4, code: '058', name: 'Fidelity Bank' },
    { id: 5, code: '070', name: 'Fidelity Bank (GTB)' },
    { id: 6, code: '215', name: 'Guaranty Trust Bank (GTB)' },
    { id: 7, code: '012', name: 'IBTC Chartered Bank' },
    { id: 8, code: '082', name: 'Keystone Bank' },
    { id: 9, code: '526', name: 'Neo Bank' },
    { id: 10, code: '090', name: 'Mainstreet Bank' },
    { id: 11, code: '100', name: 'SunTrust Bank' },
    { id: 12, code: '033', name: 'United Bank for Africa (UBA)' },
    { id: 13, code: '035', name: 'Wema Bank' },
    { id: 14, code: '057', name: 'Zenith Bank' },
    { id: 15, code: '060', name: 'FCMB Bank' },
  ];

  try {
    // Flutterwave API endpoint for banks - use specific country code
    const response = await flutterwaveClient.get(`/banks/${country}`);
    
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
    // Try alternative endpoint if first one fails
    if (err.response?.status === 400 || err.response?.status === 404) {
      logger.warn(`Country ${country} not found in banks list, trying general endpoint`);
      try {
        const fallbackResponse = await flutterwaveClient.get('/banks');
        const banks = fallbackResponse.data.data;
        return {
          success: true,
          banks: banks.map(bank => ({
            id: bank.id,
            code: bank.code,
            name: bank.name,
          })),
        };
      } catch (fallbackErr) {
        logger.warn('Flutterwave getBankList fallback error, using hardcoded list:', fallbackErr.response?.data || fallbackErr.message);
        return {
          success: true,
          banks: fallbackBanks,
          usingFallback: true,
        };
      }
    }
    
    logger.warn('Flutterwave getBankList error, using hardcoded list:', err.response?.data || err.message);
    return {
      success: true,
      banks: fallbackBanks,
      usingFallback: true,
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

// Pay bills (electricity, water, cable, internet)
const payBill = async (billerId, customerReference, amount, metadata = {}) => {
  try {
    const payload = {
      country: 'NG',
      customer_id: customerReference,
      amount: Math.round(amount),
      type: billerId,
      reference: `BILL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    const response = await flutterwaveClient.post('/bills', payload);

    if (response.data.status === 'success') {
      return {
        success: true,
        reference: payload.reference,
        transactionId: response.data.data.id || response.data.data.transaction_id,
        status: 'success',
        amount: amount,
        billerId: billerId,
        message: 'Bill payment successful'
      };
    } else {
      return {
        success: false,
        error: response.data.message || 'Bill payment failed',
        status: response.data.status
      };
    }
  } catch (err) {
    logger.error('Flutterwave payBill error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Bill payment failed: ' + err.message
    };
  }
};

// Buy airtime
const buyAirtime = async (networkCode, phoneNumber, amount, metadata = {}) => {
  try {
    // Map network codes to Flutterwave biller IDs
    const networkMappings = {
      'MTN': 'AIRTIME_MTN',
      'GLO': 'AIRTIME_GLO',
      'AIRTEL': 'AIRTIME_AIRTEL',
      '9MOBILE': 'AIRTIME_9MOBILE',
      'mtn': 'AIRTIME_MTN',
      'glo': 'AIRTIME_GLO',
      'airtel': 'AIRTIME_AIRTEL',
      '9mobile': 'AIRTIME_9MOBILE'
    };

    const billerId = networkMappings[networkCode] || `AIRTIME_${networkCode.toUpperCase()}`;

    const payload = {
      country: 'NG',
      customer_id: phoneNumber,
      amount: Math.round(amount),
      type: billerId,
      reference: `AIRTIME-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    const response = await flutterwaveClient.post('/bills', payload);

    if (response.data.status === 'success') {
      return {
        success: true,
        reference: payload.reference,
        transactionId: response.data.data.id || response.data.data.transaction_id,
        status: 'success',
        amount: amount,
        phoneNumber: phoneNumber,
        network: networkCode,
        message: `Airtime purchase successful for ${phoneNumber}`
      };
    } else {
      return {
        success: false,
        error: response.data.message || 'Airtime purchase failed',
        status: response.data.status
      };
    }
  } catch (err) {
    logger.error('Flutterwave buyAirtime error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Airtime purchase failed: ' + err.message
    };
  }
};

// Buy data bundle
const buyDataBundle = async (networkCode, phoneNumber, dataPlanId, amount, metadata = {}) => {
  try {
    // Map network codes to Flutterwave biller IDs
    const networkMappings = {
      'MTN': 'DATA_MTN',
      'GLO': 'DATA_GLO',
      'AIRTEL': 'DATA_AIRTEL',
      '9MOBILE': 'DATA_9MOBILE',
      'mtn': 'DATA_MTN',
      'glo': 'DATA_GLO',
      'airtel': 'DATA_AIRTEL',
      '9mobile': 'DATA_9MOBILE'
    };

    const billerId = networkMappings[networkCode] || `DATA_${networkCode.toUpperCase()}`;

    const payload = {
      country: 'NG',
      customer_id: phoneNumber,
      amount: Math.round(amount),
      type: billerId,
      reference: `DATA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    const response = await flutterwaveClient.post('/bills', payload);

    if (response.data.status === 'success') {
      return {
        success: true,
        reference: payload.reference,
        transactionId: response.data.data.id || response.data.data.transaction_id,
        status: 'success',
        amount: amount,
        phoneNumber: phoneNumber,
        network: networkCode,
        dataPlan: dataPlanId,
        message: `Data bundle ${dataPlanId} purchase successful for ${phoneNumber}`
      };
    } else {
      return {
        success: false,
        error: response.data.message || 'Data bundle purchase failed',
        status: response.data.status
      };
    }
  } catch (err) {
    logger.error('Flutterwave buyDataBundle error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Data bundle purchase failed: ' + err.message
    };
  }
};

// Get data plans
const getDataPlans = (networkCode) => {
  const plans = {
    'MTN': [
      { id: '250MB', name: '250MB', price: 25000, duration: '7 days' },
      { id: '1GB', name: '1GB', price: 100000, duration: '7 days' },
      { id: '2GB', name: '2GB', price: 200000, duration: '7 days' },
      { id: '5GB', name: '5GB', price: 500000, duration: '30 days' },
      { id: '10GB', name: '10GB', price: 1000000, duration: '30 days' },
      { id: '20GB', name: '20GB', price: 2000000, duration: '30 days' }
    ],
    'GLO': [
      { id: '171MB', name: '171MB', price: 25000, duration: '7 days' },
      { id: '1GB', name: '1GB', price: 100000, duration: '7 days' },
      { id: '3GB', name: '3GB', price: 250000, duration: '7 days' },
      { id: '7GB', name: '7GB', price: 500000, duration: '30 days' },
      { id: '14GB', name: '14GB', price: 1000000, duration: '30 days' }
    ],
    'AIRTEL': [
      { id: '250MB', name: '250MB', price: 25000, duration: '7 days' },
      { id: '1GB', name: '1GB', price: 100000, duration: '7 days' },
      { id: '2GB', name: '2GB', price: 200000, duration: '7 days' },
      { id: '5GB', name: '5GB', price: 500000, duration: '30 days' },
      { id: '10GB', name: '10GB', price: 1000000, duration: '30 days' }
    ],
    '9MOBILE': [
      { id: '500MB', name: '500MB', price: 25000, duration: '7 days' },
      { id: '1.5GB', name: '1.5GB', price: 100000, duration: '7 days' },
      { id: '3.5GB', name: '3.5GB', price: 200000, duration: '7 days' },
      { id: '8.5GB', name: '8.5GB', price: 500000, duration: '30 days' },
      { id: '20GB', name: '20GB', price: 1000000, duration: '30 days' }
    ]
  };

  return plans[networkCode.toUpperCase()] || [];
};

// Get available bill payment providers
const getBillProviders = () => {
  return {
    electricity: [
      { id: 'ELECTRICITY', name: 'Electricity Providers', category: 'electricity' }
    ],
    water: [
      { id: 'WATER', name: 'Water Providers', category: 'water' }
    ],
    internet: [
      { id: 'INTERNET', name: 'Internet Providers', category: 'internet' }
    ],
    cable: [
      { id: 'DSTV', name: 'DStv', category: 'cable' },
      { id: 'GOTV', name: 'GoTV', category: 'cable' },
      { id: 'STARTIMES', name: 'Startimes', category: 'cable' }
    ]
  };
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
  payBill,
  buyAirtime,
  buyDataBundle,
  getDataPlans,
  getBillProviders,
};
