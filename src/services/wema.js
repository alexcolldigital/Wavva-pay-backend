const axios = require('axios');
const logger = require('../utils/logger');

const WEMA_BASE_URL = process.env.WEMA_BASE_URL || 'https://playground.alat.ng/api/v1';
const WEMA_API_KEY = process.env.WEMA_API_KEY;
const WEMA_SECRET_KEY = process.env.WEMA_SECRET_KEY;
const WEMA_MERCHANT_ID = process.env.WEMA_MERCHANT_ID;

// Validate required environment variables
if (!WEMA_API_KEY || !WEMA_SECRET_KEY || !WEMA_MERCHANT_ID) {
  logger.warn('⚠️  Wema Bank API credentials partially configured. Set WEMA_API_KEY, WEMA_SECRET_KEY, and WEMA_MERCHANT_ID for full functionality');
}

/**
 * Build Wema request headers
 * @returns {object} - Headers object
 */
function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WEMA_API_KEY}`,
    'X-API-Key': WEMA_API_KEY,
    'X-Merchant-ID': WEMA_MERCHANT_ID
  };
}

/**
 * Make Wema API call
 * @param {string} method - HTTP method (GET, POST, etc)
 * @param {string} endpoint - API endpoint (relative to base URL)
 * @param {object} payload - Request payload
 * @returns {object} - API response
 */
async function makeWemaRequest(method, endpoint, payload = {}) {
  try {
    const config = {
      method,
      url: `${WEMA_BASE_URL}/${endpoint}`,
      headers: buildHeaders(),
      ...(method !== 'GET' && { data: payload })
    };

    const response = await axios(config);

    logger.info(`✅ Wema ${method} ${endpoint} successful:`, {
      status: response.data.status,
      message: response.data.message
    });

    return {
      success: response.data.status === 'success' || response.status === 200,
      status: response.data.status || 'success',
      message: response.data.message,
      data: response.data.data || response.data,
      raw: response.data
    };
  } catch (err) {
    const errorData = err.response?.data || err.message;
    logger.error(`❌ Wema ${method} ${endpoint} error:`, errorData);
    
    return {
      success: false,
      status: err.response?.data?.status || 'error',
      error: err.response?.data?.message || err.message,
      data: err.response?.data?.data || {}
    };
  }
}

// ============================================
// Virtual Account Functions
// ============================================

/**
 * Create virtual account for a user
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string} firstName - User first name
 * @param {string} lastName - User last name
 * @param {string} phoneNumber - User phone number
 * @param {object} metadata - Additional metadata
 * @returns {object} - Virtual account creation result
 */
const createVirtualAccount = async (userId, email, firstName, lastName, phoneNumber, metadata = {}) => {
  try {
    const payload = {
      email,
      firstName,
      lastName,
      phoneNumber,
      currency: 'NGN',
      customerId: userId,
      accountType: 'personal',
      description: `Virtual account for ${firstName} ${lastName}`,
      metadata: {
        userId,
        platform: 'wavvapay',
        createdAt: new Date().toISOString(),
        ...metadata
      }
    };

    const result = await makeWemaRequest('POST', 'accounts/virtual', payload);

    if (result.success) {
      const account = result.data;
      return {
        success: true,
        accountNumber: account.accountNumber || account.account_number,
        accountName: account.accountName || account.account_name,
        bankCode: '035', // Wema Bank code
        bankName: 'Wema Bank',
        currency: 'NGN',
        status: 'active',
        accountId: account.id || account.accountId,
        reference: account.reference || account.referenceId,
        message: 'Virtual account created successfully',
        tier: account.tier || 'standard'
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status
      };
    }
  } catch (err) {
    logger.error('Wema createVirtualAccount error:', err.message);
    return {
      success: false,
      error: 'Virtual account creation failed: ' + err.message
    };
  }
};

/**
 * Get virtual account details
 * @param {string} accountId - Account ID or account number
 * @returns {object} - Account details
 */
const getVirtualAccountDetails = async (accountId) => {
  try {
    const result = await makeWemaRequest('GET', `accounts/virtual/${accountId}`);

    if (result.success) {
      const account = result.data;
      return {
        success: true,
        accountNumber: account.accountNumber || account.account_number,
        accountName: account.accountName || account.account_name,
        bankCode: '035',
        bankName: 'Wema Bank',
        currency: 'NGN',
        status: account.status || 'active',
        accountId: account.id || account.accountId,
        balance: account.balance || 0,
        createdAt: account.createdAt
      };
    } else {
      return {
        success: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema getVirtualAccountDetails error:', err.message);
    return {
      success: false,
      error: 'Failed to fetch account details: ' + err.message
    };
  }
};

/**
 * List all virtual accounts for a customer
 * @param {string} customerId - Customer ID
 * @returns {object} - List of accounts
 */
const listVirtualAccounts = async (customerId) => {
  try {
    const result = await makeWemaRequest('GET', `accounts/virtual/customer/${customerId}`);

    if (result.success) {
      const accounts = Array.isArray(result.data) ? result.data : result.data.accounts || [];
      return {
        success: true,
        accounts: accounts.map(account => ({
          accountNumber: account.accountNumber || account.account_number,
          accountName: account.accountName || account.account_name,
          bankCode: '035',
          bankName: 'Wema Bank',
          currency: 'NGN',
          status: account.status || 'active',
          accountId: account.id || account.accountId,
          balance: account.balance || 0
        })),
        count: accounts.length
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        accounts: []
      };
    }
  } catch (err) {
    logger.error('Wema listVirtualAccounts error:', err.message);
    return {
      success: false,
      error: 'Failed to list accounts: ' + err.message,
      accounts: []
    };
  }
};

// ============================================
// Real Bank Account Connection Functions
// ============================================

/**
 * Link real bank account to virtual account
 * @param {string} accountId - Virtual account ID
 * @param {string} accountNumber - Real bank account number
 * @param {string} bankCode - Real bank code
 * @param {string} accountName - Account name for verification
 * @returns {object} - Linking result
 */
const linkBankAccount = async (accountId, accountNumber, bankCode, accountName) => {
  try {
    const payload = {
      accountNumber,
      bankCode,
      accountName,
      verificationMethod: 'name_match'
    };

    const result = await makeWemaRequest('POST', `accounts/virtual/${accountId}/link`, payload);

    if (result.success) {
      return {
        success: true,
        linkedAccountId: result.data.id || result.data.linkedAccountId,
        status: 'linked',
        message: 'Bank account linked successfully'
      };
    } else {
      return {
        success: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema linkBankAccount error:', err.message);
    return {
      success: false,
      error: 'Failed to link bank account: ' + err.message
    };
  }
};

/**
 * Unlink real bank account from virtual account
 * @param {string} accountId - Virtual account ID
 * @param {string} linkedAccountId - Linked account ID to remove
 * @returns {object} - Unlinking result
 */
const unlinkBankAccount = async (accountId, linkedAccountId) => {
  try {
    const result = await makeWemaRequest('DELETE', `accounts/virtual/${accountId}/link/${linkedAccountId}`);

    if (result.success) {
      return {
        success: true,
        message: 'Bank account unlinked successfully'
      };
    } else {
      return {
        success: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema unlinkBankAccount error:', err.message);
    return {
      success: false,
      error: 'Failed to unlink bank account: ' + err.message
    };
  }
};

// ============================================
// Interbank Transfer Functions
// ============================================

/**
 * Create interbank transfer (NIP transfer)
 * @param {string} sourceAccountId - Source virtual account ID
 * @param {string} destinationAccountNumber - Destination account number
 * @param {string} destinationBankCode - Destination bank code
 * @param {number} amount - Amount in NGN
 * @param {string} narration - Transfer description
 * @returns {object} - Transfer result
 */
const createInterbankTransfer = async (sourceAccountId, destinationAccountNumber, destinationBankCode, amount, narration) => {
  try {
    const payload = {
      destinationAccountNumber,
      destinationBankCode,
      amount: Math.round(amount),
      narration: narration || 'Wavva Pay Transfer',
      currency: 'NGN',
      reference: `NIP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    const result = await makeWemaRequest('POST', `accounts/virtual/${sourceAccountId}/transfer`, payload);

    if (result.success) {
      const transfer = result.data;
      return {
        success: true,
        transferId: transfer.id || transfer.transferId,
        reference: payload.reference,
        status: transfer.status || 'pending',
        amount: amount,
        message: 'Interbank transfer initiated'
      };
    } else {
      return {
        success: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema createInterbankTransfer error:', err.message);
    return {
      success: false,
      error: 'Interbank transfer failed: ' + err.message
    };
  }
};

/**
 * Get transfer status
 * @param {string} transferId - Transfer ID
 * @returns {object} - Transfer status
 */
const getInterbankTransferStatus = async (transferId) => {
  try {
    const result = await makeWemaRequest('GET', `transfers/${transferId}`);

    if (result.success) {
      const transfer = result.data;
      return {
        success: true,
        transferId: transfer.id || transfer.transferId,
        status: transfer.status,
        amount: transfer.amount,
        reference: transfer.reference,
        dateCreated: transfer.dateCreated || transfer.createdAt
      };
    } else {
      return {
        success: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema getInterbankTransferStatus error:', err.message);
    return {
      success: false,
      error: 'Failed to get transfer status: ' + err.message
    };
  }
};

// ============================================
// Settlement Account Functions
// ============================================

/**
 * Create settlement account (for merchant settlements)
 * @param {string} merchantId - Merchant ID
 * @param {string} businessName - Business name
 * @param {string} email - Business email
 * @param {string} phoneNumber - Business phone
 * @returns {object} - Settlement account creation result
 */
const createSettlementAccount = async (merchantId, businessName, email, phoneNumber) => {
  try {
    const payload = {
      merchantId,
      businessName,
      email,
      phoneNumber,
      accountType: 'settlement',
      currency: 'NGN',
      description: `Settlement account for ${businessName}`
    };

    const result = await makeWemaRequest('POST', 'accounts/settlement', payload);

    if (result.success) {
      const account = result.data;
      return {
        success: true,
        accountNumber: account.accountNumber || account.account_number,
        accountName: account.accountName || account.account_name,
        bankCode: '035',
        bankName: 'Wema Bank',
        currency: 'NGN',
        status: 'active',
        accountId: account.id || account.accountId,
        message: 'Settlement account created successfully'
      };
    } else {
      return {
        success: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema createSettlementAccount error:', err.message);
    return {
      success: false,
      error: 'Settlement account creation failed: ' + err.message
    };
  }
};

/**
 * Get settlement account details
 * @param {string} merchantId - Merchant ID
 * @returns {object} - Settlement account details
 */
const getSettlementAccount = async (merchantId) => {
  try {
    const result = await makeWemaRequest('GET', `accounts/settlement/${merchantId}`);

    if (result.success) {
      const account = result.data;
      return {
        success: true,
        accountNumber: account.accountNumber || account.account_number,
        accountName: account.accountName || account.account_name,
        bankCode: '035',
        bankName: 'Wema Bank',
        currency: 'NGN',
        status: account.status || 'active',
        accountId: account.id || account.accountId,
        balance: account.balance || 0
      };
    } else {
      return {
        success: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema getSettlementAccount error:', err.message);
    return {
      success: false,
      error: 'Failed to fetch settlement account: ' + err.message
    };
  }
};

// ============================================
// KYC / Verification Functions
// ============================================

/**
 * Verify BVN (Bank Verification Number)
 * @param {string} bvn - Bank Verification Number
 * @param {string} firstName - First name for verification
 * @param {string} lastName - Last name for verification
 * @param {string} phoneNumber - Phone number for verification
 * @returns {object} - BVN verification result
 */
const verifyBVN = async (bvn, firstName, lastName, phoneNumber) => {
  try {
    const payload = {
      bvn,
      firstName,
      lastName,
      phoneNumber,
      verificationType: 'full'
    };

    const result = await makeWemaRequest('POST', 'kyc/bvn/verify', payload);

    if (result.success) {
      const verification = result.data;
      return {
        success: true,
        verified: verification.verified || verification.status === 'verified',
        bvn: verification.bvn,
        firstName: verification.firstName,
        lastName: verification.lastName,
        middleName: verification.middleName,
        phoneNumber: verification.phoneNumber,
        dateOfBirth: verification.dateOfBirth,
        gender: verification.gender,
        address: verification.address,
        confidence: verification.confidence || 100,
        message: 'BVN verification successful'
      };
    } else {
      return {
        success: false,
        verified: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema verifyBVN error:', err.message);
    return {
      success: false,
      verified: false,
      error: 'BVN verification failed: ' + err.message
    };
  }
};

/**
 * Verify NIN (National Identity Number)
 * @param {string} nin - National Identity Number
 * @param {string} firstName - First name for verification
 * @param {string} lastName - Last name for verification
 * @param {string} phoneNumber - Phone number for verification
 * @returns {object} - NIN verification result
 */
const verifyNIN = async (nin, firstName, lastName, phoneNumber) => {
  try {
    const payload = {
      nin,
      firstName,
      lastName,
      phoneNumber,
      verificationType: 'full'
    };

    const result = await makeWemaRequest('POST', 'kyc/nin/verify', payload);

    if (result.success) {
      const verification = result.data;
      return {
        success: true,
        verified: verification.verified || verification.status === 'verified',
        nin: verification.nin,
        firstName: verification.firstName,
        lastName: verification.lastName,
        middleName: verification.middleName,
        phoneNumber: verification.phoneNumber,
        dateOfBirth: verification.dateOfBirth,
        gender: verification.gender,
        address: verification.address,
        confidence: verification.confidence || 100,
        message: 'NIN verification successful'
      };
    } else {
      return {
        success: false,
        verified: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema verifyNIN error:', err.message);
    return {
      success: false,
      verified: false,
      error: 'NIN verification failed: ' + err.message
    };
  }
};

/**
 * Perform name verification (against bank records)
 * @param {string} accountNumber - Account number to verify
 * @param {string} bankCode - Bank code
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @returns {object} - Name verification result
 */
const verifyName = async (accountNumber, bankCode, firstName, lastName) => {
  try {
    const payload = {
      accountNumber,
      bankCode,
      firstName,
      lastName,
      verificationType: 'name_match'
    };

    const result = await makeWemaRequest('POST', 'kyc/name/verify', payload);

    if (result.success) {
      const verification = result.data;
      return {
        success: true,
        verified: verification.verified || verification.match,
        accountNumber: verification.accountNumber,
        accountName: verification.accountName,
        bankCode: verification.bankCode,
        bankName: verification.bankName,
        confidence: verification.confidence || 100,
        message: 'Name verification successful'
      };
    } else {
      return {
        success: false,
        verified: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema verifyName error:', err.message);
    return {
      success: false,
      verified: false,
      error: 'Name verification failed: ' + err.message
    };
  }
};

/**
 * Check compliance status and tier limits
 * @param {string} customerId - Customer ID
 * @param {number} transactionAmount - Transaction amount in NGN
 * @param {string} transactionType - Type of transaction
 * @returns {object} - Compliance check result
 */
const checkCompliance = async (customerId, transactionAmount, transactionType) => {
  try {
    const payload = {
      customerId,
      transactionAmount,
      transactionType,
      checkType: 'pre_transaction'
    };

    const result = await makeWemaRequest('POST', 'compliance/check', payload);

    if (result.success) {
      const compliance = result.data;
      return {
        success: true,
        approved: compliance.approved || compliance.status === 'approved',
        tier: compliance.tier || 'standard',
        dailyLimit: compliance.dailyLimit || 0,
        monthlyLimit: compliance.monthlyLimit || 0,
        transactionLimit: compliance.transactionLimit || 0,
        remainingDaily: compliance.remainingDaily || 0,
        remainingMonthly: compliance.remainingMonthly || 0,
        riskScore: compliance.riskScore || 0,
        flags: compliance.flags || [],
        message: compliance.message || 'Compliance check completed'
      };
    } else {
      return {
        success: false,
        approved: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema checkCompliance error:', err.message);
    return {
      success: false,
      approved: false,
      error: 'Compliance check failed: ' + err.message
    };
  }
};

/**
 * Get customer tier information and limits
 * @param {string} customerId - Customer ID
 * @returns {object} - Tier information
 */
const getCustomerTier = async (customerId) => {
  try {
    const result = await makeWemaRequest('GET', `customers/${customerId}/tier`);

    if (result.success) {
      const tier = result.data;
      return {
        success: true,
        tier: tier.tier || 'standard',
        tierName: tier.tierName || tier.name,
        dailyLimit: tier.dailyLimit || 0,
        monthlyLimit: tier.monthlyLimit || 0,
        transactionLimit: tier.transactionLimit || 0,
        features: tier.features || [],
        upgradeRequirements: tier.upgradeRequirements || [],
        status: tier.status || 'active'
      };
    } else {
      return {
        success: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema getCustomerTier error:', err.message);
    return {
      success: false,
      error: 'Failed to get customer tier: ' + err.message
    };
  }
};

/**
 * Get user's connected bank accounts (Open Banking)
 * @param {string} customerId - Customer ID
 * @returns {object} - List of connected bank accounts
 */
const getConnectedBankAccounts = async (customerId) => {
  try {
    const result = await makeWemaRequest('GET', `customers/${customerId}/accounts`);

    if (result.success) {
      const accounts = Array.isArray(result.data) ? result.data : result.data.accounts || [];
      return {
        success: true,
        accounts: accounts.map(account => ({
          accountNumber: account.accountNumber || account.account_number,
          accountName: account.accountName || account.account_name,
          bankCode: account.bankCode || account.bank_code,
          bankName: account.bankName || account.bank_name,
          currency: account.currency || 'NGN',
          status: account.status || 'active',
          accountId: account.id || account.accountId
        })),
        count: accounts.length
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        accounts: []
      };
    }
  } catch (err) {
    logger.error('Wema getConnectedBankAccounts error:', err.message);
    return {
      success: false,
      error: 'Failed to fetch connected accounts: ' + err.message,
      accounts: []
    };
  }
};

/**
 * Initiate account linking via Open Banking
 * @param {string} customerId - Customer ID
 * @returns {object} - Account linking initialization
 */
const initiateAccountLinking = async (customerId) => {
  try {
    const payload = {
      customerId,
      redirectUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
    };

    const result = await makeWemaRequest('POST', 'auth/authorize', payload);

    if (result.success) {
      return {
        success: true,
        authorizationUrl: result.data.authorizationUrl || result.data.authorization_url,
        reference: result.data.reference || result.data.referenceId,
        message: 'Redirect user to authorization URL to link accounts'
      };
    } else {
      return {
        success: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema initiateAccountLinking error:', err.message);
    return {
      success: false,
      error: 'Account linking initiation failed: ' + err.message
    };
  }
};

// ============================================
// Bill Payment Functions (Wema Bills Platform)
// ============================================

/**
 * Buy airtime
 * @param {string} networkCode - Network code (MTN, GLO, AIRTEL, 9MOBILE)
 * @param {string} phoneNumber - Phone number to buy airtime for
 * @param {number} amount - Amount in kobo
 * @param {object} metadata - Additional metadata
 * @returns {object} - Airtime purchase result
 */
const buyAirtime = async (networkCode, phoneNumber, amount, metadata = {}) => {
  try {
    // Map network codes to Wema provider codes
    const networkMappings = {
      'MTN': 'MTN',
      'GLO': 'GLO',
      'AIRTEL': 'AIRTEL',
      '9MOBILE': '9MOBILE',
      'mtn': 'MTN',
      'glo': 'GLO',
      'airtel': 'AIRTEL',
      '9mobile': '9MOBILE'
    };

    const providerCode = networkMappings[networkCode] || networkCode.toUpperCase();

    const payload = {
      provider: providerCode,
      phoneNumber: phoneNumber,
      amount: Math.round(amount / 100), // Convert from kobo to naira
      customerId: metadata.customerId || phoneNumber,
      reference: `AIRTIME-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        network: networkCode,
        serviceType: 'airtime',
        ...metadata
      }
    };

    const result = await makeWemaRequest('POST', 'bills/airtime', payload);

    if (result.success) {
      return {
        success: true,
        reference: result.data.reference || payload.reference,
        transactionId: result.data.transactionId || result.data.id,
        status: 'success',
        amount: amount,
        phoneNumber: phoneNumber,
        network: networkCode,
        message: result.message || `Airtime purchase successful for ${phoneNumber}`
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status
      };
    }
  } catch (err) {
    logger.error('Wema buyAirtime error:', err.message);
    return {
      success: false,
      error: 'Airtime purchase failed: ' + err.message
    };
  }
};

/**
 * Buy data bundle
 * @param {string} networkCode - Network code (MTN, GLO, AIRTEL, 9MOBILE)
 * @param {string} phoneNumber - Phone number to buy data for
 * @param {string} dataPlanId - Data plan identifier
 * @param {number} amount - Amount in kobo
 * @param {object} metadata - Additional metadata
 * @returns {object} - Data bundle purchase result
 */
const buyDataBundle = async (networkCode, phoneNumber, dataPlanId, amount, metadata = {}) => {
  try {
    // Map network codes to Wema provider codes
    const networkMappings = {
      'MTN': 'MTN',
      'GLO': 'GLO',
      'AIRTEL': 'AIRTEL',
      '9MOBILE': '9MOBILE',
      'mtn': 'MTN',
      'glo': 'GLO',
      'airtel': 'AIRTEL',
      '9mobile': '9MOBILE'
    };

    const providerCode = networkMappings[networkCode] || networkCode.toUpperCase();

    const payload = {
      provider: providerCode,
      phoneNumber: phoneNumber,
      dataPlanId: dataPlanId,
      amount: Math.round(amount / 100), // Convert from kobo to naira
      customerId: metadata.customerId || phoneNumber,
      reference: `DATA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        network: networkCode,
        dataPlan: dataPlanId,
        serviceType: 'data',
        ...metadata
      }
    };

    const result = await makeWemaRequest('POST', 'bills/data', payload);

    if (result.success) {
      return {
        success: true,
        reference: result.data.reference || payload.reference,
        transactionId: result.data.transactionId || result.data.id,
        status: 'success',
        amount: amount,
        phoneNumber: phoneNumber,
        network: networkCode,
        dataPlan: dataPlanId,
        message: result.message || `Data bundle ${dataPlanId} purchase successful for ${phoneNumber}`
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status
      };
    }
  } catch (err) {
    logger.error('Wema buyDataBundle error:', err.message);
    return {
      success: false,
      error: 'Data bundle purchase failed: ' + err.message
    };
  }
};

/**
 * Pay electricity bill
 * @param {string} providerId - Electricity provider ID (e.g., EKO_ELECTRICITY, IKEJA_ELECTRICITY)
 * @param {string} meterNumber - Meter number
 * @param {string} meterType - Meter type (prepaid/postpaid)
 * @param {number} amount - Amount in kobo
 * @param {object} metadata - Additional metadata
 * @returns {object} - Electricity bill payment result
 */
const payElectricityBill = async (providerId, meterNumber, meterType, amount, metadata = {}) => {
  try {
    const payload = {
      provider: providerId,
      meterNumber: meterNumber,
      meterType: meterType || 'prepaid',
      amount: Math.round(amount / 100), // Convert from kobo to naira
      customerId: metadata.customerId || meterNumber,
      reference: `ELECTRICITY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        provider: providerId,
        meterNumber: meterNumber,
        meterType: meterType,
        serviceType: 'electricity',
        ...metadata
      }
    };

    const result = await makeWemaRequest('POST', 'bills/electricity', payload);

    if (result.success) {
      return {
        success: true,
        reference: result.data.reference || payload.reference,
        transactionId: result.data.transactionId || result.data.id,
        status: 'success',
        amount: amount,
        meterNumber: meterNumber,
        provider: providerId,
        meterType: meterType,
        token: result.data.token, // Electricity token if applicable
        message: result.message || `Electricity bill payment successful for meter ${meterNumber}`
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status
      };
    }
  } catch (err) {
    logger.error('Wema payElectricityBill error:', err.message);
    return {
      success: false,
      error: 'Electricity bill payment failed: ' + err.message
    };
  }
};

/**
 * Pay cable TV bill
 * @param {string} providerId - Cable provider ID (DSTV, GOTV, STARTIMES)
 * @param {string} smartCardNumber - Smart card number
 * @param {number} amount - Amount in kobo
 * @param {object} metadata - Additional metadata
 * @returns {object} - Cable TV bill payment result
 */
const payCableTVBill = async (providerId, smartCardNumber, amount, metadata = {}) => {
  try {
    const payload = {
      provider: providerId,
      smartCardNumber: smartCardNumber,
      amount: Math.round(amount / 100), // Convert from kobo to naira
      customerId: metadata.customerId || smartCardNumber,
      reference: `CABLE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        provider: providerId,
        smartCardNumber: smartCardNumber,
        serviceType: 'cable',
        ...metadata
      }
    };

    const result = await makeWemaRequest('POST', 'bills/cable', payload);

    if (result.success) {
      return {
        success: true,
        reference: result.data.reference || payload.reference,
        transactionId: result.data.transactionId || result.data.id,
        status: 'success',
        amount: amount,
        smartCardNumber: smartCardNumber,
        provider: providerId,
        message: result.message || `Cable TV bill payment successful for ${smartCardNumber}`
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status
      };
    }
  } catch (err) {
    logger.error('Wema payCableTVBill error:', err.message);
    return {
      success: false,
      error: 'Cable TV bill payment failed: ' + err.message
    };
  }
};

/**
 * Pay water bill
 * @param {string} providerId - Water provider ID
 * @param {string} accountNumber - Account number
 * @param {number} amount - Amount in kobo
 * @param {object} metadata - Additional metadata
 * @returns {object} - Water bill payment result
 */
const payWaterBill = async (providerId, accountNumber, amount, metadata = {}) => {
  try {
    const payload = {
      provider: providerId,
      accountNumber: accountNumber,
      amount: Math.round(amount / 100), // Convert from kobo to naira
      customerId: metadata.customerId || accountNumber,
      reference: `WATER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        provider: providerId,
        accountNumber: accountNumber,
        serviceType: 'water',
        ...metadata
      }
    };

    const result = await makeWemaRequest('POST', 'bills/water', payload);

    if (result.success) {
      return {
        success: true,
        reference: result.data.reference || payload.reference,
        transactionId: result.data.transactionId || result.data.id,
        status: 'success',
        amount: amount,
        accountNumber: accountNumber,
        provider: providerId,
        message: result.message || `Water bill payment successful for account ${accountNumber}`
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status
      };
    }
  } catch (err) {
    logger.error('Wema payWaterBill error:', err.message);
    return {
      success: false,
      error: 'Water bill payment failed: ' + err.message
    };
  }
};

/**
 * Pay internet bill
 * @param {string} providerId - Internet provider ID
 * @param {string} accountNumber - Account number
 * @param {number} amount - Amount in kobo
 * @param {object} metadata - Additional metadata
 * @returns {object} - Internet bill payment result
 */
const payInternetBill = async (providerId, accountNumber, amount, metadata = {}) => {
  try {
    const payload = {
      provider: providerId,
      accountNumber: accountNumber,
      amount: Math.round(amount / 100), // Convert from kobo to naira
      customerId: metadata.customerId || accountNumber,
      reference: `INTERNET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        provider: providerId,
        accountNumber: accountNumber,
        serviceType: 'internet',
        ...metadata
      }
    };

    const result = await makeWemaRequest('POST', 'bills/internet', payload);

    if (result.success) {
      return {
        success: true,
        reference: result.data.reference || payload.reference,
        transactionId: result.data.transactionId || result.data.id,
        status: 'success',
        amount: amount,
        accountNumber: accountNumber,
        provider: providerId,
        message: result.message || `Internet bill payment successful for account ${accountNumber}`
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        status: result.status
      };
    }
  } catch (err) {
    logger.error('Wema payInternetBill error:', err.message);
    return {
      success: false,
      error: 'Internet bill payment failed: ' + err.message
    };
  }
};

/**
 * Get bill providers
 * @param {string} category - Bill category (airtime, data, electricity, cable, water, internet)
 * @returns {object} - List of providers
 */
const getBillProviders = async (category = null) => {
  try {
    const endpoint = category ? `bills/providers?category=${category}` : 'bills/providers';
    const result = await makeWemaRequest('GET', endpoint);

    if (result.success) {
      const providers = Array.isArray(result.data) ? result.data : result.data.providers || [];
      return {
        success: true,
        providers: providers.map(provider => ({
          id: provider.id || provider.code,
          name: provider.name,
          category: provider.category,
          status: provider.status || 'active'
        })),
        count: providers.length
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        providers: []
      };
    }
  } catch (err) {
    logger.error('Wema getBillProviders error:', err.message);
    return {
      success: false,
      error: 'Failed to fetch bill providers: ' + err.message,
      providers: []
    };
  }
};

/**
 * Get data plans for a network
 * @param {string} networkCode - Network code
 * @returns {object} - List of data plans
 */
const getDataPlans = async (networkCode) => {
  try {
    const result = await makeWemaRequest('GET', `bills/data/plans?network=${networkCode}`);

    if (result.success) {
      const plans = Array.isArray(result.data) ? result.data : result.data.plans || [];
      return {
        success: true,
        plans: plans.map(plan => ({
          id: plan.id || plan.code,
          name: plan.name,
          amount: plan.amount,
          validity: plan.validity,
          dataVolume: plan.dataVolume || plan.volume
        })),
        count: plans.length
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        plans: []
      };
    }
  } catch (err) {
    logger.error('Wema getDataPlans error:', err.message);
    return {
      success: false,
      error: 'Failed to fetch data plans: ' + err.message,
      plans: []
    };
  }
};

/**
 * Perform fraud check on transaction
 * @param {string} customerId - Customer ID
 * @param {number} amount - Transaction amount
 * @param {string} transactionType - Type of transaction
 * @param {object} metadata - Additional transaction metadata
 * @returns {object} - Fraud check result
 */
const checkFraud = async (customerId, amount, transactionType, metadata = {}) => {
  try {
    const payload = {
      customerId,
      amount,
      transactionType,
      timestamp: new Date().toISOString(),
      ipAddress: metadata.ipAddress,
      deviceFingerprint: metadata.deviceFingerprint,
      location: metadata.location,
      metadata
    };

    const result = await makeWemaRequest('POST', 'monitoring/fraud/check', payload);

    if (result.success) {
      const fraudCheck = result.data;
      return {
        success: true,
        approved: fraudCheck.approved || fraudCheck.status === 'approved',
        riskScore: fraudCheck.riskScore || 0,
        riskLevel: fraudCheck.riskLevel || 'low',
        flags: fraudCheck.flags || [],
        recommendations: fraudCheck.recommendations || [],
        message: fraudCheck.message || 'Fraud check completed'
      };
    } else {
      return {
        success: false,
        approved: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema checkFraud error:', err.message);
    return {
      success: false,
      approved: false,
      error: 'Fraud check failed: ' + err.message
    };
  }
};

/**
 * Log transaction for monitoring
 * @param {string} transactionId - Transaction ID
 * @param {string} customerId - Customer ID
 * @param {object} transactionData - Transaction details
 * @returns {object} - Logging result
 */
const logTransaction = async (transactionId, customerId, transactionData) => {
  try {
    const payload = {
      transactionId,
      customerId,
      ...transactionData,
      timestamp: new Date().toISOString(),
      loggedBy: 'wavvapay_system'
    };

    const result = await makeWemaRequest('POST', 'monitoring/transactions/log', payload);

    if (result.success) {
      return {
        success: true,
        logId: result.data.logId || result.data.id,
        message: 'Transaction logged successfully'
      };
    } else {
      return {
        success: false,
        error: result.error || result.message
      };
    }
  } catch (err) {
    logger.error('Wema logTransaction error:', err.message);
    return {
      success: false,
      error: 'Transaction logging failed: ' + err.message
    };
  }
};

/**
 * Get transaction logs for monitoring
 * @param {string} customerId - Customer ID
 * @param {object} filters - Filter options
 * @returns {object} - Transaction logs
 */
const getTransactionLogs = async (customerId, filters = {}) => {
  try {
    const queryParams = new URLSearchParams({
      customerId,
      ...filters
    });

    const result = await makeWemaRequest('GET', `monitoring/transactions/logs?${queryParams}`);

    if (result.success) {
      const logs = Array.isArray(result.data) ? result.data : result.data.logs || [];
      return {
        success: true,
        logs: logs.map(log => ({
          logId: log.id || log.logId,
          transactionId: log.transactionId,
          customerId: log.customerId,
          amount: log.amount,
          type: log.type,
          status: log.status,
          timestamp: log.timestamp,
          riskScore: log.riskScore,
          flags: log.flags || []
        })),
        count: logs.length
      };
    } else {
      return {
        success: false,
        error: result.error || result.message,
        logs: []
      };
    }
  } catch (err) {
    logger.error('Wema getTransactionLogs error:', err.message);
    return {
      success: false,
      error: 'Failed to get transaction logs: ' + err.message,
      logs: []
    };
  }
};

module.exports = {
  // Virtual account functions
  createVirtualAccount,
  getVirtualAccountDetails,
  listVirtualAccounts,
  
  // Real bank account linking
  linkBankAccount,
  unlinkBankAccount,
  
  // Interbank transfer
  createInterbankTransfer,
  getInterbankTransferStatus,
  
  // Settlement account
  createSettlementAccount,
  getSettlementAccount,
  
  // Open banking
  getConnectedBankAccounts,
  initiateAccountLinking,
  
  // KYC / Verification
  verifyBVN,
  verifyNIN,
  verifyName,
  checkCompliance,
  getCustomerTier,
  
  // Transaction monitoring
  checkFraud,
  logTransaction,
  getTransactionLogs,

  // Bill payment functions
  buyAirtime,
  buyDataBundle,
  payElectricityBill,
  payCableTVBill,
  payWaterBill,
  payInternetBill,
  getBillProviders,
  getDataPlans
};
