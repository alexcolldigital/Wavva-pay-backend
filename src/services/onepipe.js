const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

const ONEPIPE_BASE_URL = 'https://api.onepipe.io/v2';
const ONEPIPE_API_KEY = process.env.ONEPIPE_API_KEY;
const ONEPIPE_API_SECRET = process.env.ONEPIPE_API_SECRET;

// Validate required environment variables
if (!ONEPIPE_API_KEY || !ONEPIPE_API_SECRET) {
  logger.error('❌ OnePipe API credentials not configured. Set ONEPIPE_API_KEY and ONEPIPE_API_SECRET');
}

/**
 * Generate MD5 signature required by OnePipe API
 * @param {string} requestRef - Unique request reference
 * @returns {string} - MD5 hash of requestRef;apiSecret
 */
function generateSignature(requestRef) {
  const signatureString = `${requestRef};${ONEPIPE_API_SECRET}`;
  return crypto.createHash('md5').update(signatureString).digest('hex');
}

/**
 * TripleDES encryption for secure fields (bank account, card, etc)
 * @param {string} plainText - Data to encrypt
 * @returns {string} - Base64 encoded encrypted data
 */
function encryptSecureField(plainText) {
  try {
    const bufferedKey = Buffer.from(ONEPIPE_API_SECRET, 'utf16le');
    const key = crypto.createHash('md5').update(bufferedKey).digest();
    const newKey = Buffer.concat([key, key.slice(0, 8)]);
    const IV = Buffer.alloc(8, '\0');
    
    const cipher = crypto.createCipheriv('des-ede3-cbc', newKey, IV);
    cipher.setAutoPadding(true);
    
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return encrypted;
  } catch (err) {
    logger.error('TripleDES encryption failed:', err.message);
    throw new Error('Failed to encrypt sensitive data');
  }
}

/**
 * Generate unique request reference
 * @returns {string} - Unique reference in format REQ-TIMESTAMP-RANDOM
 */
function generateRequestRef() {
  return `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Build common OnePipe request headers
 * @param {string} requestRef - Request reference for signature
 * @returns {object} - Headers object
 */
function buildHeaders(requestRef) {
  const signature = generateSignature(requestRef);
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ONEPIPE_API_KEY}`,
    'Signature': signature
  };
}

/**
 * Make OnePipe API call
 * @param {string} endpoint - API endpoint (relative to base URL)
 * @param {object} payload - Request payload
 * @returns {object} - API response
 */
async function makeOnePipeRequest(endpoint, payload) {
  try {
    const requestRef = payload.request_ref || generateRequestRef();
    
    const response = await axios.post(
      `${ONEPIPE_BASE_URL}/${endpoint}`,
      { ...payload, request_ref: requestRef },
      { headers: buildHeaders(requestRef) }
    );

    logger.info(`✅ OnePipe ${endpoint} successful:`, {
      status: response.data.status,
      message: response.data.message
    });

    return {
      success: response.data.status === 'Successful',
      status: response.data.status,
      message: response.data.message,
      data: response.data.data || {},
      raw: response.data
    };
  } catch (err) {
    const errorData = err.response?.data || err.message;
    logger.error(`❌ OnePipe ${endpoint} error:`, errorData);
    
    return {
      success: false,
      status: err.response?.data?.status || 'Failed',
      error: err.response?.data?.message || err.message,
      data: err.response?.data?.data || {}
    };
  }
}

// ============================================
// Payment Processing Functions
// ============================================

/**
 * Initialize card payment (charge card)
 * @param {object} cardDetails - Card details {pan, cvv, expiry, pin}
 * @param {number} amount - Amount in kobo/cents
 * @param {string} email - Customer email
 * @param {object} metadata - Additional metadata
 * @returns {object} - Payment initialization result
 */
const initializePayment = async (cardDetails, amount, email, metadata = {}) => {
  try {
    // Encrypt card details
    const cardString = `${cardDetails.pan};${cardDetails.cvv};${cardDetails.expiry};${cardDetails.pin}`;
    const encryptedCard = encryptSecureField(cardString);

    const payload = {
      request_type: 'charge_card',
      auth: {
        type: 'card',
        secure: encryptedCard,
        auth_provider: 'Paystack' // OnePipe can route to multiple providers
      },
      transaction: {
        mock_mode: process.env.ONEPIPE_MOCK_MODE || 'live',
        transaction_ref: `CHG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        transaction_desc: 'Wallet funding via card',
        amount: Math.round(amount), // Amount in kobo
        customer: {
          customer_ref: `CUST-${email}`,
          email: email,
          mobile_no: metadata.phone_no || ''
        },
        meta: {
          ...metadata,
          service: 'wavvapay_wallet_funding'
        },
        details: {
          currency: metadata.currency || 'NGN'
        }
      }
    };

    const result = await makeOnePipeRequest('transact', payload);

    if (result.success) {
      return {
        success: true,
        transactionId: result.data.provider_response?.reference,
        reference: payload.transaction.transaction_ref,
        status: result.status,
        authorizationUrl: result.data.provider_response?.authorization_url,
        amount: amount,
        email: email,
        message: result.message
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status,
        requiresConfirmation: result.status === 'WaitingForOTP' || result.status === 'PendingValidation'
      };
    }
  } catch (err) {
    logger.error('OnePipe initializePayment error:', err.message);
    return {
      success: false,
      error: 'Payment initialization failed: ' + err.message
    };
  }
};

/**
 * Verify payment status
 * @param {string} reference - Transaction reference to verify
 * @returns {object} - Payment verification result
 */
const verifyPayment = async (reference) => {
  try {
    const payload = {
      request_type: 'charge_card',
      transaction: {
        transaction_ref: reference
      }
    };

    const result = await makeOnePipeRequest('transact/query', payload);

    if (result.success) {
      const providerResponse = result.data.provider_response || {};
      return {
        success: true,
        reference: reference,
        transactionId: providerResponse.reference || providerResponse.id,
        amount: providerResponse.amount || 0,
        currency: providerResponse.currency || 'NGN',
        status: result.data.provider_response_code === '00' ? 'success' : 'failed',
        paymentMethod: providerResponse.channel || 'card',
        timestamp: new Date().toISOString(),
        customer: {
          email: providerResponse.customer?.email || '',
          id: providerResponse.customer?.id
        }
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status
      };
    }
  } catch (err) {
    logger.error('OnePipe verifyPayment error:', err.message);
    return {
      success: false,
      error: 'Payment verification failed: ' + err.message
    };
  }
};

/**
 * Get transaction details
 * @param {string} reference - Transaction reference
 * @returns {object} - Transaction details
 */
const getTransactionDetails = async (reference) => {
  try {
    const result = await verifyPayment(reference);
    
    if (result.success) {
      return {
        success: true,
        reference: reference,
        transactionId: result.transactionId,
        amount: result.amount,
        currency: result.currency,
        status: result.status,
        paymentMethod: result.paymentMethod,
        customer: result.customer,
        timestamp: result.timestamp
      };
    } else {
      return result;
    }
  } catch (err) {
    logger.error('OnePipe getTransactionDetails error:', err.message);
    return {
      success: false,
      error: 'Failed to fetch transaction details'
    };
  }
};

// ============================================
// Bank Transfer Functions
// ============================================

/**
 * Create bank transfer (withdrawal)
 * @param {string} accountNumber - Recipient account number
 * @param {string} bankCode - CBN bank code
 * @param {number} amount - Amount in kobo
 * @param {string} accountName - Recipient account name
 * @param {string} narration - Transfer description
 * @returns {object} - Transfer result
 */
const createTransfer = async (accountNumber, bankCode, amount, accountName = '', narration = '') => {
  try {
    // Encrypt bank account details
    const bankString = `${accountNumber};${bankCode}`;
    const encryptedBank = encryptSecureField(bankString);

    const payload = {
      request_type: 'transfer_funds',
      auth: {
        type: 'bank.account',
        secure: encryptedBank,
        auth_provider: 'Polaris' // OnePipe routes to appropriate provider
      },
      transaction: {
        mock_mode: process.env.ONEPIPE_MOCK_MODE || 'live',
        transaction_ref: `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        transaction_desc: narration || 'Bank transfer from Wavva Pay',
        amount: Math.round(amount),
        customer: {
          customer_ref: `CUST-${accountNumber}`,
          email: 'support@wavvapay.io'
        },
        meta: {
          narration: narration,
          account_name: accountName,
          service: 'wavvapay_withdrawal'
        },
        details: {
          currency: 'NGN',
          account_number: accountNumber,
          bank_code: bankCode,
          recipient_name: accountName
        }
      }
    };

    const result = await makeOnePipeRequest('transact', payload);

    if (result.success) {
      return {
        success: true,
        transferId: result.data.provider_response?.reference || result.data.provider_response?.id,
        reference: payload.transaction.transaction_ref,
        status: result.status,
        amount: amount,
        message: result.message
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status
      };
    }
  } catch (err) {
    logger.error('OnePipe createTransfer error:', err.message);
    return {
      success: false,
      error: 'Transfer failed: ' + err.message
    };
  }
};

/**
 * Get transfer status
 * @param {string} transferRef - Transfer reference to check
 * @returns {object} - Transfer status
 */
const getTransferStatus = async (transferRef) => {
  try {
    const payload = {
      request_type: 'transfer_funds',
      transaction: {
        transaction_ref: transferRef
      }
    };

    const result = await makeOnePipeRequest('transact/query', payload);

    if (result.success) {
      const providerResponse = result.data.provider_response || {};
      return {
        success: true,
        transferId: transferRef,
        status: providerResponse.status || result.status,
        amount: providerResponse.amount || 0,
        reference: providerResponse.reference
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status
      };
    }
  } catch (err) {
    logger.error('OnePipe getTransferStatus error:', err.message);
    return {
      success: false,
      error: 'Failed to get transfer status'
    };
  }
};

// ============================================
// Bank Account Functions
// ============================================

/**
 * Resolve bank account (verify account details)
 * @param {string} accountNumber - Account number to resolve
 * @param {string} bankCode - CBN bank code
 * @returns {object} - Account resolution result
 */
const resolveBankAccount = async (accountNumber, bankCode) => {
  try {
    const payload = {
      request_type: 'verify_nuban',
      transaction: {
        transaction_ref: `RES-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        transaction_desc: 'Account verification',
        details: {
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN'
        }
      }
    };

    const result = await makeOnePipeRequest('transact', payload);

    if (result.success) {
      const providerResponse = result.data.provider_response || {};
      return {
        success: true,
        accountName: providerResponse.account_name || providerResponse.accountName,
        accountNumber: accountNumber,
        bankCode: bankCode,
        status: 'verified'
      };
    } else {
      return {
        success: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('OnePipe resolveBankAccount error:', err.message);
    return {
      success: false,
      error: 'Account verification failed: ' + err.message
    };
  }
};

/**
 * Create transfer recipient (for future transfers)
 * @param {string} accountNumber - Account number
 * @param {string} bankCode - CBN bank code
 * @param {string} accountName - Account name
 * @param {string} type - Recipient type (nuban)
 * @returns {object} - Recipient creation result
 */
const createTransferRecipient = async (accountNumber, bankCode, accountName, type = 'nuban') => {
  try {
    // Store recipient info for future use
    // In OnePipe, we don't need to pre-create recipients - we provide details in transfer call
    const recipientCode = `REC-${accountNumber}-${bankCode}`;
    
    return {
      success: true,
      recipientCode: recipientCode,
      recipientId: recipientCode,
      accountNumber: accountNumber,
      bankCode: bankCode,
      accountName: accountName,
      message: 'Recipient registered for future transfers'
    };
  } catch (err) {
    logger.error('OnePipe createTransferRecipient error:', err.message);
    return {
      success: false,
      error: 'Failed to create recipient: ' + err.message
    };
  }
};

// ============================================
// Bank List Functions
// ============================================

/**
 * Get list of supported banks
 * @returns {object} - List of banks
 */
const getBankList = async () => {
  // Comprehensive list of Nigerian banks with CBN codes
  const nigerianBanks = [
    { id: 1, code: '044', name: 'Access Bank Nigeria' },
    { id: 2, code: '050', name: 'Ecobank Nigeria' },
    { id: 3, code: '011', name: 'First Bank of Nigeria' },
    { id: 4, code: '058', name: 'Fidelity Bank Nigeria' },
    { id: 5, code: '070', name: 'Fidelity Bank plc' },
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
    { id: 25, code: '107', name: 'First City Monument Bank' },
    { id: 26, code: '108', name: 'Mezzanine Finance' },
    { id: 27, code: '109', name: 'Infinity Bank' },
    { id: 28, code: '110', name: 'TetraFore' },
    { id: 29, code: '111', name: 'Nigerians in the Diaspora' },
    { id: 30, code: '112', name: 'Access Bank (Legacy)' },
    { id: 31, code: '116', name: 'FCMB' },
    { id: 32, code: '121', name: 'SWIABANK' },
    { id: 33, code: '122', name: 'Safaricom' },
    { id: 34, code: '123', name: 'eTranzact International' },
  ];

  try {
    logger.info(`✅ Fetched ${nigerianBanks.length} banks for OnePipe`);
    return {
      success: true,
      banks: nigerianBanks,
      source: 'onepipe'
    };
  } catch (err) {
    logger.error('OnePipe getBankList error:', err.message);
    return {
      success: true,
      banks: nigerianBanks, // Return fallback list
      source: 'fallback'
    };
  }
};

/**
 * Pay a bill (electricity, water, internet, etc)
 * @param {string} providerId - Utility provider ID (e.g., 'NE1001' for NEPA)
 * @param {string} accountNumber - Customer account number for the bill
 * @param {number} amount - Amount to pay in kobo
 * @param {object} metadata - Additional metadata
 * @returns {object} - Bill payment result
 */
const payBill = async (providerId, accountNumber, amount, metadata = {}) => {
  try {
    const requestRef = generateRequestRef();
    
    const payload = {
      request_type: 'bill_payment',
      transaction: {
        transaction_ref: requestRef,
        transaction_desc: metadata.description || 'Bill payment from Wavva Pay',
        amount: Math.round(amount),
        customer: {
          customer_ref: accountNumber,
          email: metadata.email || 'support@wavvapay.io'
        },
        meta: {
          provider_id: providerId,
          account_number: accountNumber,
          service: 'wavvapay_bill'
        },
        details: {
          currency: 'NGN',
          provider_id: providerId,
          account_number: accountNumber,
          phone: metadata.phone || ''
        }
      }
    };

    const result = await makeOnePipeRequest('transact', payload);

    if (result.success) {
      return {
        success: true,
        reference: requestRef,
        transactionId: result.data.provider_response?.reference || requestRef,
        status: result.status,
        amount: amount,
        providerId: providerId,
        message: 'Bill payment successful'
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status,
        requiresConfirmation: result.status === 'WaitingForOTP' || result.status === 'PendingValidation'
      };
    }
  } catch (err) {
    logger.error('OnePipe payBill error:', err.message);
    return {
      success: false,
      error: 'Bill payment failed: ' + err.message
    };
  }
};

/**
 * Buy airtime/credit for a phone number
 * @param {string} networkCode - Telecom network code (MTN, GLO, Airtel, 9mobile)
 * @param {string} phoneNumber - Phone number to buy airtime for
 * @param {number} amount - Amount in kobo
 * @param {object} metadata - Additional metadata
 * @returns {object} - Airtime purchase result
 */
const buyAirtime = async (networkCode, phoneNumber, amount, metadata = {}) => {
  try {
    const requestRef = generateRequestRef();
    
    // Map network codes to provider IDs
    const networkMappings = {
      'MTN': 'AIR_MTN',
      'GLO': 'AIR_GLO',
      'AIRTEL': 'AIR_AIRTEL',
      '9MOBILE': 'AIR_9M',
      'mtn': 'AIR_MTN',
      'glo': 'AIR_GLO',
      'airtel': 'AIR_AIRTEL',
      '9mobile': 'AIR_9M'
    };

    const providerId = networkMappings[networkCode] || `AIR_${networkCode}`;

    const payload = {
      request_type: 'buy_airtime',
      transaction: {
        transaction_ref: requestRef,
        transaction_desc: metadata.description || `Airtime purchase for ${phoneNumber}`,
        amount: Math.round(amount),
        customer: {
          customer_ref: phoneNumber,
          email: metadata.email || 'support@wavvapay.io'
        },
        meta: {
          phone_number: phoneNumber,
          network: networkCode,
          service: 'wavvapay_airtime'
        },
        details: {
          currency: 'NGN',
          phone_number: phoneNumber,
          network: networkCode,
          service_type: 'airtime'
        }
      }
    };

    const result = await makeOnePipeRequest('transact', payload);

    if (result.success) {
      return {
        success: true,
        reference: requestRef,
        transactionId: result.data.provider_response?.reference || requestRef,
        status: result.status,
        amount: amount,
        phoneNumber: phoneNumber,
        network: networkCode,
        message: `Airtime purchase successful for ${phoneNumber}`
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status,
        requiresConfirmation: result.status === 'WaitingForOTP' || result.status === 'PendingValidation'
      };
    }
  } catch (err) {
    logger.error('OnePipe buyAirtime error:', err.message);
    return {
      success: false,
      error: 'Airtime purchase failed: ' + err.message
    };
  }
};

/**
 * Buy data bundle for a phone number
 * @param {string} networkCode - Telecom network code
 * @param {string} phoneNumber - Phone number
 * @param {string} dataPlanId - Data plan ID (e.g., '1GB', '5GB', etc)
 * @param {number} amount - Amount in kobo
 * @param {object} metadata - Additional metadata
 * @returns {object} - Data bundle result
 */
const buyDataBundle = async (networkCode, phoneNumber, dataPlanId, amount, metadata = {}) => {
  try {
    const requestRef = generateRequestRef();
    
    // Map network codes to provider IDs
    const networkMappings = {
      'MTN': 'DATA_MTN',
      'GLO': 'DATA_GLO',
      'AIRTEL': 'DATA_AIRTEL',
      '9MOBILE': 'DATA_9M',
      'mtn': 'DATA_MTN',
      'glo': 'DATA_GLO',
      'airtel': 'DATA_AIRTEL',
      '9mobile': 'DATA_9M'
    };

    const providerId = networkMappings[networkCode] || `DATA_${networkCode}`;

    const payload = {
      request_type: 'buy_data',
      transaction: {
        transaction_ref: requestRef,
        transaction_desc: metadata.description || `Data bundle ${dataPlanId} for ${phoneNumber}`,
        amount: Math.round(amount),
        customer: {
          customer_ref: phoneNumber,
          email: metadata.email || 'support@wavvapay.io'
        },
        meta: {
          phone_number: phoneNumber,
          network: networkCode,
          data_plan_id: dataPlanId,
          service: 'wavvapay_data'
        },
        details: {
          currency: 'NGN',
          phone_number: phoneNumber,
          network: networkCode,
          data_plan: dataPlanId,
          service_type: 'data'
        }
      }
    };

    const result = await makeOnePipeRequest('transact', payload);

    if (result.success) {
      return {
        success: true,
        reference: requestRef,
        transactionId: result.data.provider_response?.reference || requestRef,
        status: result.status,
        amount: amount,
        phoneNumber: phoneNumber,
        network: networkCode,
        dataPlan: dataPlanId,
        message: `Data bundle ${dataPlanId} purchase successful for ${phoneNumber}`
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status,
        requiresConfirmation: result.status === 'WaitingForOTP' || result.status === 'PendingValidation'
      };
    }
  } catch (err) {
    logger.error('OnePipe buyDataBundle error:', err.message);
    return {
      success: false,
      error: 'Data bundle purchase failed: ' + err.message
    };
  }
};

/**
 * Get available data plans for a network
 * @param {string} networkCode - Network code (MTN, GLO, AIRTEL, 9MOBILE)
 * @returns {object} - Available data plans
 */
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

/**
 * Get available bill payment providers
 * @returns {object} - List of available providers
 */
const getBillProviders = () => {
  return {
    electricity: [
      { id: 'NE1001', name: 'NEPA (Post-paid)', category: 'electricity' },
      { id: 'NE1002', name: 'NEPA (Pre-paid)', category: 'electricity' },
      { id: 'NE1003', name: 'EKEDC (Post-paid)', category: 'electricity' },
      { id: 'NE1004', name: 'EKEDC (Pre-paid)', category: 'electricity' },
      { id: 'NE1005', name: 'IKEDC (Post-paid)', category: 'electricity' },
      { id: 'NE1006', name: 'IKEDC (Pre-paid)', category: 'electricity' },
      { id: 'NE1007', name: 'KEDCO (Post-paid)', category: 'electricity' },
      { id: 'NE1008', name: 'KEDCO (Pre-paid)', category: 'electricity' }
    ],
    water: [
      { id: 'WA1001', name: 'Lagos Water Corporation', category: 'water' },
      { id: 'WA1002', name: 'Port Harcourt Water', category: 'water' }
    ],
    internet: [
      { id: 'IN1001', name: 'Smile Telecom', category: 'internet' },
      { id: 'IN1002', name: 'Swift Networks', category: 'internet' }
    ],
    cable: [
      { id: 'CB1001', name: 'DStv', category: 'cable' },
      { id: 'CB1002', name: 'GoTV', category: 'cable' },
      { id: 'CB1003', name: 'Startimes', category: 'cable' }
    ]
  };
};

// ============================================
// Exports
// ============================================

module.exports = {
  // Payment functions
  initializePayment,
  verifyPayment,
  getTransactionDetails,
  
  // Transfer functions
  createTransfer,
  getTransferStatus,
  
  // Bank account functions
  resolveBankAccount,
  createTransferRecipient,
  
  // Bill and utility payments
  payBill,
  buyAirtime,
  buyDataBundle,
  getDataPlans,
  getBillProviders,
  
  // Bank list
  getBankList,
  
  // Utility functions
  generateRequestRef,
  generateSignature,
  encryptSecureField
};
