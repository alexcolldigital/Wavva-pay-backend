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

// ============================================
// Card Payment Functions
// ============================================

/**
 * Process card payment for wallet funding
 * @param {string} email - Customer email
 * @param {number} amount - Amount in NGN
 * @param {object} cardDetails - Card details
 * @param {object} metadata - Additional metadata
 * @returns {object} - Payment result
 */
const processCardPayment = async (email, amount, cardDetails, metadata = {}) => {
  try {
    const payload = {
      tx_ref: `CARD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency: 'NGN',
      payment_type: 'card',
      redirect_url: `${getFrontendUrl()}/wallet?payment_status=true`,
      customer: {
        email,
      },
      card: {
        number: cardDetails.number,
        cvv: cardDetails.cvv,
        expiry_month: cardDetails.expiryMonth,
        expiry_year: cardDetails.expiryYear,
        pin: cardDetails.pin
      },
      meta: metadata,
    };

    const response = await flutterwaveClient.post('/charges?type=card', payload);

    logger.info(`Card payment initiated: ${payload.tx_ref}`);

    return {
      success: response.data.status === 'success',
      transactionId: response.data.data?.id,
      reference: payload.tx_ref,
      status: response.data.data?.status || response.data.status,
      amount: amount,
      currency: 'NGN',
      paymentMethod: 'card',
      message: response.data.message || 'Card payment processed'
    };
  } catch (err) {
    logger.error('Flutterwave processCardPayment error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Card payment failed',
    };
  }
};

/**
 * Create recurring payment (subscription)
 * @param {string} email - Customer email
 * @param {number} amount - Amount per charge
 * @param {string} interval - Billing interval (daily, weekly, monthly)
 * @param {object} cardDetails - Card details for tokenization
 * @param {object} metadata - Additional metadata
 * @returns {object} - Subscription result
 */
const createRecurringPayment = async (email, amount, interval, cardDetails, metadata = {}) => {
  try {
    // First, tokenize the card
    const tokenizePayload = {
      email,
      amount: 100, // Small amount for tokenization
      currency: 'NGN',
      card: {
        number: cardDetails.number,
        cvv: cardDetails.cvv,
        expiry_month: cardDetails.expiryMonth,
        expiry_year: cardDetails.expiryYear,
        pin: cardDetails.pin
      }
    };

    const tokenizeResponse = await flutterwaveClient.post('/charges?type=card', tokenizePayload);

    if (tokenizeResponse.data.status !== 'success') {
      return {
        success: false,
        error: 'Card tokenization failed'
      };
    }

    const token = tokenizeResponse.data.data.flw_ref;

    // Create subscription
    const subscriptionPayload = {
      email,
      amount,
      currency: 'NGN',
      interval,
      token,
      tx_ref: `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      meta: metadata,
    };

    const response = await flutterwaveClient.post('/subscriptions', subscriptionPayload);

    logger.info(`Recurring payment created: ${subscriptionPayload.tx_ref}`);

    return {
      success: response.data.status === 'success',
      subscriptionId: response.data.data?.id,
      reference: subscriptionPayload.tx_ref,
      status: response.data.data?.status,
      amount: amount,
      interval: interval,
      token: token,
      message: 'Recurring payment setup successful'
    };
  } catch (err) {
    logger.error('Flutterwave createRecurringPayment error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Recurring payment setup failed',
    };
  }
};

// ============================================
// Payment Gateway Functions
// ============================================

/**
 * Create payment link for merchant payments
 * @param {string} merchantId - Merchant ID
 * @param {number} amount - Payment amount
 * @param {string} currency - Currency code
 * @param {string} description - Payment description
 * @param {object} metadata - Additional metadata
 * @returns {object} - Payment link result
 */
const createPaymentLink = async (merchantId, amount, currency = 'NGN', description, metadata = {}) => {
  try {
    const payload = {
      tx_ref: `LINK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency,
      redirect_url: `${getFrontendUrl()}/payment/success`,
      payment_options: 'card,mobilemoney,ussd,banktransfer',
      customer: {
        email: metadata.customerEmail || 'customer@example.com',
      },
      customizations: {
        title: 'Payment Link',
        description: description || 'Secure payment',
        logo: metadata.logo || `${getFrontendUrl()}/logo.png`,
      },
      meta: {
        merchantId,
        ...metadata
      },
    };

    const response = await flutterwaveClient.post('/payments', payload);

    logger.info(`Payment link created: ${payload.tx_ref}`);

    return {
      success: response.data.status === 'success',
      paymentLink: response.data.data?.link,
      reference: payload.tx_ref,
      amount: amount,
      currency: currency,
      merchantId: merchantId,
      message: 'Payment link created successfully'
    };
  } catch (err) {
    logger.error('Flutterwave createPaymentLink error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Payment link creation failed',
    };
  }
};

/**
 * Create checkout session for website payments
 * @param {object} checkoutData - Checkout configuration
 * @returns {object} - Checkout session result
 */
const createCheckoutSession = async (checkoutData) => {
  try {
    const payload = {
      tx_ref: `CHECKOUT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount: checkoutData.amount,
      currency: checkoutData.currency || 'NGN',
      redirect_url: checkoutData.redirectUrl || `${getFrontendUrl()}/checkout/success`,
      payment_options: checkoutData.paymentOptions || 'card,mobilemoney,ussd,banktransfer',
      customer: checkoutData.customer,
      customizations: checkoutData.customizations || {},
      meta: checkoutData.metadata || {},
      subaccounts: checkoutData.subaccounts || [], // For split payments
    };

    const response = await flutterwaveClient.post('/payments', payload);

    logger.info(`Checkout session created: ${payload.tx_ref}`);

    return {
      success: response.data.status === 'success',
      checkoutUrl: response.data.data?.link,
      reference: payload.tx_ref,
      sessionId: response.data.data?.id,
      amount: checkoutData.amount,
      currency: checkoutData.currency,
      message: 'Checkout session created successfully'
    };
  } catch (err) {
    logger.error('Flutterwave createCheckoutSession error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Checkout session creation failed',
    };
  }
};

// ============================================
// QR / POS / NFC Payment Functions
// ============================================

/**
 * Generate QR code for payment
 * @param {string} merchantId - Merchant ID
 * @param {number} amount - Payment amount
 * @param {string} currency - Currency code
 * @param {object} metadata - Additional metadata
 * @returns {object} - QR code result
 */
const generatePaymentQR = async (merchantId, amount, currency = 'NGN', metadata = {}) => {
  try {
    const payload = {
      tx_ref: `QR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency,
      payment_type: 'qr',
      merchant_id: merchantId,
      meta: metadata,
    };

    const response = await flutterwaveClient.post('/payments/qr/generate', payload);

    logger.info(`QR payment generated: ${payload.tx_ref}`);

    return {
      success: response.data.status === 'success',
      qrCode: response.data.data?.qr_code,
      qrData: response.data.data?.qr_data,
      reference: payload.tx_ref,
      amount: amount,
      currency: currency,
      merchantId: merchantId,
      message: 'QR code generated successfully'
    };
  } catch (err) {
    logger.error('Flutterwave generatePaymentQR error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'QR code generation failed',
    };
  }
};

/**
 * Process POS payment
 * @param {string} merchantId - Merchant ID
 * @param {number} amount - Payment amount
 * @param {object} posData - POS terminal data
 * @param {object} metadata - Additional metadata
 * @returns {object} - POS payment result
 */
const processPOSPayment = async (merchantId, amount, posData, metadata = {}) => {
  try {
    const payload = {
      tx_ref: `POS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency: 'NGN',
      payment_type: 'pos',
      merchant_id: merchantId,
      pos_terminal_id: posData.terminalId,
      pos_transaction_ref: posData.transactionRef,
      meta: metadata,
    };

    const response = await flutterwaveClient.post('/payments/pos/process', payload);

    logger.info(`POS payment processed: ${payload.tx_ref}`);

    return {
      success: response.data.status === 'success',
      transactionId: response.data.data?.id,
      reference: payload.tx_ref,
      status: response.data.data?.status,
      amount: amount,
      merchantId: merchantId,
      terminalId: posData.terminalId,
      message: 'POS payment processed successfully'
    };
  } catch (err) {
    logger.error('Flutterwave processPOSPayment error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'POS payment failed',
    };
  }
};

/**
 * Create payment request (NFC/QR payment request)
 * @param {string} senderId - Sender user ID
 * @param {number} amount - Requested amount
 * @param {string} currency - Currency code
 * @param {string} description - Payment description
 * @param {object} metadata - Additional metadata
 * @returns {object} - Payment request result
 */
const createPaymentRequest = async (senderId, amount, currency = 'NGN', description, metadata = {}) => {
  try {
    const payload = {
      tx_ref: `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency,
      payment_type: 'request',
      sender_id: senderId,
      description: description || 'Payment request',
      meta: metadata,
    };

    const response = await flutterwaveClient.post('/payments/request', payload);

    logger.info(`Payment request created: ${payload.tx_ref}`);

    return {
      success: response.data.status === 'success',
      requestId: response.data.data?.id,
      reference: payload.tx_ref,
      qrCode: response.data.data?.qr_code,
      paymentLink: response.data.data?.payment_link,
      amount: amount,
      currency: currency,
      senderId: senderId,
      description: description,
      message: 'Payment request created successfully'
    };
  } catch (err) {
    logger.error('Flutterwave createPaymentRequest error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Payment request creation failed',
    };
  }
};

// ============================================
// Enhanced Bills & Airtime Functions
// ============================================

/**
 * Get electricity providers
 * @returns {object} - Electricity providers list
 */
const getElectricityProviders = () => {
  return {
    success: true,
    providers: [
      { id: 'EKO_ELECTRIC', name: 'Eko Electricity', code: 'EKEDC' },
      { id: 'IBADAN_ELECTRIC', name: 'Ibadan Electricity', code: 'IBEDC' },
      { id: 'IKEJA_ELECTRIC', name: 'Ikeja Electricity', code: 'IKEDC' },
      { id: 'KANO_ELECTRIC', name: 'Kano Electricity', code: 'KEDCO' },
      { id: 'ENUGU_ELECTRIC', name: 'Enugu Electricity', code: 'EEDC' },
      { id: 'ABUJA_ELECTRIC', name: 'Abuja Electricity', code: 'AEDC' },
      { id: 'PORT_HARCOURT_ELECTRIC', name: 'Port Harcourt Electricity', code: 'PHED' },
      { id: 'JOS_ELECTRIC', name: 'Jos Electricity', code: 'JED' }
    ]
  };
};

/**
 * Get cable TV providers
 * @returns {object} - Cable TV providers list
 */
const getCableProviders = () => {
  return {
    success: true,
    providers: [
      { id: 'DSTV', name: 'DStv', code: 'DSTV' },
      { id: 'GOTV', name: 'GoTV', code: 'GOTV' },
      { id: 'STARTIMES', name: 'Startimes', code: 'STARTIMES' },
      { id: 'TSTV', name: 'TSTV', code: 'TSTV' }
    ]
  };
};

/**
 * Get betting providers
 * @returns {object} - Betting providers list
 */
const getBettingProviders = () => {
  return {
    success: true,
    providers: [
      { id: 'BET9JA', name: 'Bet9ja', code: 'BET9JA' },
      { id: 'SPORTYBET', name: 'Sportybet', code: 'SPORTYBET' },
      { id: 'NAIRABET', name: 'Nairabet', code: 'NAIRABET' },
      { id: 'BETKING', name: 'Betking', code: 'BETKING' }
    ]
  };
};

// ============================================
// Enhanced Webhook Functions
// ============================================

/**
 * Process enhanced webhook events
 * @param {object} webhookData - Webhook payload
 * @returns {object} - Processing result
 */
const processWebhookEvent = async (webhookData) => {
  try {
    const event = webhookData.event;
    const data = webhookData.data;

    logger.info(`Processing Flutterwave webhook: ${event}`, {
      transactionId: data.id,
      reference: data.tx_ref,
      status: data.status
    });

    let result = { success: true, processed: true };

    switch (event) {
      case 'charge.completed':
        result = await handleChargeCompleted(data);
        break;
      case 'transfer.completed':
        result = await handleTransferCompleted(data);
        break;
      case 'subscription.created':
        result = await handleSubscriptionCreated(data);
        break;
      case 'subscription.cancelled':
        result = await handleSubscriptionCancelled(data);
        break;
      case 'bill.created':
        result = await handleBillCreated(data);
        break;
      case 'bill.completed':
        result = await handleBillCompleted(data);
        break;
      default:
        logger.info(`Unhandled webhook event: ${event}`);
        result = { success: true, processed: false, message: 'Event not handled' };
    }

    return result;
  } catch (err) {
    logger.error('Flutterwave processWebhookEvent error:', err.message);
    return {
      success: false,
      error: 'Webhook processing failed: ' + err.message
    };
  }
};

/**
 * Handle charge completed webhook
 */
const handleChargeCompleted = async (data) => {
  // Implementation for charge completed
  logger.info('Processing charge completed:', data.tx_ref);
  return { success: true, message: 'Charge completed processed' };
};

/**
 * Handle transfer completed webhook
 */
const handleTransferCompleted = async (data) => {
  // Implementation for transfer completed
  logger.info('Processing transfer completed:', data.reference);
  return { success: true, message: 'Transfer completed processed' };
};

/**
 * Handle subscription created webhook
 */
const handleSubscriptionCreated = async (data) => {
  // Implementation for subscription created
  logger.info('Processing subscription created:', data.id);
  return { success: true, message: 'Subscription created processed' };
};

/**
 * Handle subscription cancelled webhook
 */
const handleSubscriptionCancelled = async (data) => {
  // Implementation for subscription cancelled
  logger.info('Processing subscription cancelled:', data.id);
  return { success: true, message: 'Subscription cancelled processed' };
};

/**
 * Handle bill created webhook
 */
const handleBillCreated = async (data) => {
  // Implementation for bill created
  logger.info('Processing bill created:', data.reference);
  return { success: true, message: 'Bill created processed' };
};

/**
 * Handle bill completed webhook
 */
const handleBillCompleted = async (data) => {
  // Implementation for bill completed
  logger.info('Processing bill completed:', data.reference);
  return { success: true, message: 'Bill completed processed' };
};

module.exports = {
  // Payment initialization and verification
  initializePayment,
  verifyPayment,
  getTransactionDetails,
  
  // Card payments
  processCardPayment,
  createRecurringPayment,
  
  // Payment gateway
  createPaymentLink,
  createCheckoutSession,
  
  // Transfers and bank operations
  createTransfer,
  getTransferStatus,
  resolveBankAccount,
  getBankList,
  initiateBankTransfer,
  
  // Bills & Airtime
  payBill,
  buyAirtime,
  buyDataBundle,
  getDataPlans,
  getElectricityProviders,
  getCableProviders,
  getBettingProviders,
  
  // QR / POS / NFC payments
  generatePaymentQR,
  processPOSPayment,
  createPaymentRequest,
  
  // Enhanced webhooks
  processWebhookEvent,
  handleChargeCompleted,
  handleTransferCompleted,
  handleSubscriptionCreated,
  handleSubscriptionCancelled,
  handleBillCreated,
  handleBillCompleted,
};
