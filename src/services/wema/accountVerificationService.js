// Wema Account Verification Service
// Handles account name enquiry

const axios = require('axios');

module.exports = {
  async verifyAccountNumber(accountNumber, bankCode) {
    const productCode = process.env.WEMA_ACCOUNT_VERIFICATION_PRODUCT_CODE;
    // Example payload for Wema API
    const payload = {
      account_number: accountNumber,
      bank_code: bankCode,
      product_code: productCode,
      // other required fields
    };
    // Call Wema API to verify account
    // await axios.post(WEMA_API_URL, payload, { headers: { ... } });
    // Return name
  },
};