// Wema Account Verification Service
// Handles account name enquiry using Customer Identification Service

const wemaApiClient = require('../../utils/wemaApiClient');
const logger = require('../../utils/logger');

module.exports = {
  async verifyAccountNumber(accountNumber, bankCode) {
    try {
      // Check if Wema API is properly configured
      const isApiConfigured = process.env.WEMA_SUBSCRIPTION_KEY &&
                             process.env.WEMA_SUBSCRIPTION_KEY !== 'your-wema-subscription-key' &&
                             process.env.WEMA_API_KEY &&
                             process.env.WEMA_API_KEY !== 'your_wema_api_key_here';

      if (!isApiConfigured) {
        // Return mock data for development/testing
        logger.warn('Wema API not configured, returning mock account verification data');

        // Simple mock logic based on account number
        const mockNames = [
          'John Doe',
          'Jane Smith',
          'Michael Johnson',
          'Sarah Williams',
          'David Brown'
        ];

        // Use last digit of account number to select a mock name
        const nameIndex = parseInt(accountNumber.slice(-1)) % mockNames.length;
        const mockAccountName = mockNames[nameIndex];

        return {
          success: true,
          data: {
            accountName: mockAccountName,
            accountNumber: accountNumber,
            bankCode: bankCode
          }
        };
      }

      // For account verification, we can use the Funds Transfer API's name enquiry
      // or the Customer Identification Service depending on the bank

      const payload = {
        accountNumber,
        bankCode,
        currencyCode: 'NGN'
      };

      // Call Wema Account Verification/Name Enquiry API
      const response = await wemaApiClient.post('/fundstransferopenapi/v1/name-enquiry', payload);

      if (response.data && response.data.success) {
        return {
          success: true,
          data: {
            accountName: response.data.data?.accountName,
            accountNumber: response.data.data?.accountNumber,
            bankCode: response.data.data?.bankCode
          }
        };
      } else {
        throw new Error(response.data?.message || 'Account verification failed');
      }

    } catch (error) {
      logger.error('Account Verification Error:', error.message);
      throw error;
    }
  },

  async verifyCustomerIdentity(bvn, phoneNumber) {
    try {
      // Use Customer Identification Service for BVN verification
      const payload = {
        bvn,
        phoneNumber,
        verificationType: 'BVN'
      };

      const response = await wemaApiClient.post('/customeridentification/v1/verify', payload);

      if (response.data && response.data.success) {
        return {
          success: true,
          data: {
            isValid: true,
            customerDetails: response.data.data
          }
        };
      } else {
        return {
          success: false,
          data: {
            isValid: false,
            message: response.data?.message || 'Verification failed'
          }
        };
      }

    } catch (error) {
      logger.error('Customer Identity Verification Error:', error.message);
      throw error;
    }
  }
};