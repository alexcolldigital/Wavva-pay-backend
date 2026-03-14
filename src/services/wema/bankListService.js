// Wema Bank List Service
// Fetches and caches list of Nigerian banks

const axios = require('axios');

module.exports = {
  async getBankList() {
    const productCode = process.env.WEMA_BANK_LIST_PRODUCT_CODE;
    // Example payload for Wema API (if product code is required)
    // const payload = { product_code: productCode };
    // Call Wema API to get banks, cache result
  },
};