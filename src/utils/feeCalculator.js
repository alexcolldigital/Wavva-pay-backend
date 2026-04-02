/**
 * Fee Calculator for Transactions
 * Different fees based on transaction type and currency
 */

const FEE_CONFIG = {
  'p2p_transfer': {
    'NGN': 0.75,   // 0.75% for Naira P2P
    'USD': 1.0,    // 1.0% for Dollar P2P
  },
  'bank_transfer': {
    'NGN': 1.0,    // 1.0% for Naira Bank Transfer
    'USD': 1.5,    // 1.5% for Dollar Bank Transfer
  },
  'wallet_funding': {
    'NGN': 0.5,    // 0.5% for Naira Wallet Funding
    'USD': 1.0,    // 1.0% for Dollar Wallet Funding
  },
  'international_transfer': {
    'NGN': 2.0,    // 2.0% for Naira International
    'USD': 2.5,    // 2.5% for Dollar International
  },
};

/**
 * Calculate transaction fee based on currency and transaction type
 * 
 * Fee Model: Sender pays amount + fee, Receiver gets full amount
 * Example: Send ₦7000 with 0.75% fee
 *   - Receiver gets: ₦7000 (full amount)
 *   - Sender pays: ₦7000 + ₦52.50 (₦7052.50)
 *   - Fee/Commission: ₦52.50
 * 
 * @param {number} amount - Amount in cents (what receiver should get)
 * @param {string} currency - Currency code (USD or NGN)
 * @param {string} transactionType - Type of transaction
 * @returns {object} - { feePercentage, feeAmount, netAmount, grossAmount }
 */
function calculateFee(amount, currency = 'NGN', transactionType = 'p2p_transfer') {
  if (!amount || amount <= 0) {
    throw new Error('Invalid amount');
  }

  if (!FEE_CONFIG[transactionType]) {
    throw new Error(`Unsupported transaction type: ${transactionType}`);
  }

  if (!FEE_CONFIG[transactionType][currency]) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  const feePercentage = FEE_CONFIG[transactionType][currency];
  const feeAmount = Math.round((amount * feePercentage) / 100); // Calculate fee and round to nearest cent
  const netAmount = amount; // Receiver gets the FULL amount (not amount - fee)
  const grossAmount = amount + feeAmount; // Total sender pays

  return {
    feePercentage,
    feeAmount,
    netAmount,         // What receiver gets (full amount)
    grossAmount,       // What sender pays (amount + fee)
  };
}

/**
 * Get fee percentage for a currency and transaction type
 * @param {string} currency - Currency code
 * @param {string} transactionType - Type of transaction
 * @returns {number} - Fee percentage
 */
function getFeePercentage(currency, transactionType = 'p2p_transfer') {
  return FEE_CONFIG[transactionType]?.[currency] || 0;
}

/**
 * Get all configured fees
 * @returns {object} - Fee configuration
 */
function getAllFees() {
  return JSON.parse(JSON.stringify(FEE_CONFIG));
}

module.exports = {
  calculateFee,
  getFeePercentage,
  getAllFees,
};
