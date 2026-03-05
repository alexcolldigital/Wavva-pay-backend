/**
 * Format amount to currency string
 * @param {number} amountInCents - Amount in cents
 * @param {string} currency - Currency code (USD, NGN, etc.)
 * @returns {string} Formatted currency string
 */
function formatCurrency(amountInCents, currency = 'NGN') {
  const amount = amountInCents / 100;
  
  const formatters = {
    'NGN': new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }),
    'USD': new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }),
    'EUR': new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }),
    'GBP': new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  };
  
  const formatter = formatters[currency] || formatters['NGN'];
  return formatter.format(amount);
}

/**
 * Parse currency string to cents
 * @param {string} currencyString - Currency string (e.g., "₦100.50")
 * @returns {number} Amount in cents
 */
function parseCurrency(currencyString) {
  // Remove all non-numeric characters except decimal point
  const numericString = currencyString.replace(/[^\d.]/g, '');
  const amount = parseFloat(numericString);
  return Math.round(amount * 100); // Convert to cents
}

/**
 * Calculate percentage of amount
 * @param {number} amountInCents - Amount in cents
 * @param {number} percentage - Percentage value
 * @returns {number} Result in cents
 */
function calculatePercentage(amountInCents, percentage) {
  return Math.round((amountInCents * percentage) / 100);
}

/**
 * Convert cents to display format
 * @param {number} amountInCents - Amount in cents
 * @returns {number} Amount in currency units
 */
function centsToDisplay(amountInCents) {
  return amountInCents / 100;
}

/**
 * Convert display format to cents
 * @param {number} displayAmount - Amount in currency units
 * @returns {number} Amount in cents
 */
function displayToCents(displayAmount) {
  return Math.round(displayAmount * 100);
}

module.exports = {
  formatCurrency,
  parseCurrency,
  calculatePercentage,
  centsToDisplay,
  displayToCents
};
