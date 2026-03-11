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
// Open Banking Functions
// ============================================

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
// Exports
// ============================================

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
  initiateAccountLinking
};
