// Wema API Client
// Handles authentication and common request patterns for Wema ALAT APIs

const axios = require('axios');

class WemaApiClient {
  constructor() {
    this.baseURL = process.env.WEMA_BASE_URL || 'https://wema-alatdev-apimgt.developer.azure-api.net';
    this.subscriptionKey = process.env.WEMA_SUBSCRIPTION_KEY;
    this.apiKey = process.env.WEMA_API_KEY;
    this.apiSecret = process.env.WEMA_API_SECRET;
    this.merchantId = process.env.WEMA_MERCHANT_ID;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use((config) => {
      // Add API key and secret to headers if required
      if (this.apiKey && this.apiSecret) {
        config.headers['X-API-Key'] = this.apiKey;
        config.headers['X-API-Secret'] = this.apiSecret;
      }
      if (this.merchantId) {
        config.headers['X-Merchant-ID'] = this.merchantId;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('Wema API Error:', error.response?.data || error.message);
        throw error;
      }
    );
  }

  // Generic GET request with optional product code
  async get(endpoint, params = {}, productCode = null) {
    const config = { params };
    if (productCode) {
      config.headers = { 'X-Product-Code': productCode };
    }
    return this.client.get(endpoint, config);
  }

  // Generic POST request with optional product code
  async post(endpoint, data = {}, productCode = null) {
    const config = {};
    if (productCode) {
      config.headers = { 'X-Product-Code': productCode };
    }
    return this.client.post(endpoint, data, config);
  }

  // Generic PUT request with optional product code
  async put(endpoint, data = {}, productCode = null) {
    const config = {};
    if (productCode) {
      config.headers = { 'X-Product-Code': productCode };
    }
    return this.client.put(endpoint, data, config);
  }

  // Generic DELETE request with optional product code
  async delete(endpoint, productCode = null) {
    const config = {};
    if (productCode) {
      config.headers = { 'X-Product-Code': productCode };
    }
    return this.client.delete(endpoint, config);
  }
}

module.exports = new WemaApiClient();