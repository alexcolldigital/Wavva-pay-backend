// Wema Customer Identification Service
// Handles BVN/NIN verification, customer profile, and KYC upgrades

const wemaApiClient = require('../../utils/wemaApiClient');
const logger = require('../../utils/logger');

module.exports = {
  async verifyBVN(bvn, phoneNumber) {
    try {
      const payload = {
        bvn,
        phoneNumber,
        verificationType: 'BVN'
      };

      const response = await wemaApiClient.post('/customer-identification/bvn-verification', payload, process.env.WEMA_CUSTOMER_IDENTIFICATION_PRODUCT_CODE);

      if (response.data && response.data.success) {
        return {
          success: true,
          data: {
            isValid: true,
            customerDetails: {
              bvn: response.data.data?.bvn,
              firstName: response.data.data?.firstName,
              lastName: response.data.data?.lastName,
              dateOfBirth: response.data.data?.dateOfBirth,
              phoneNumber: response.data.data?.phoneNumber,
              email: response.data.data?.email
            }
          }
        };
      } else {
        return {
          success: false,
          message: response.data?.message || 'BVN verification failed'
        };
      }

    } catch (error) {
      logger.error('BVN Verification Error:', error.message);
      throw error;
    }
  },

  async verifyNIN(nin, phoneNumber) {
    try {
      const payload = {
        nin,
        phoneNumber,
        verificationType: 'NIN'
      };

      const response = await wemaApiClient.post('/customer-identification/nin-verification', payload, process.env.WEMA_CUSTOMER_IDENTIFICATION_PRODUCT_CODE);

      if (response.data && response.data.success) {
        return {
          success: true,
          data: {
            isValid: true,
            customerDetails: {
              nin: response.data.data?.nin,
              firstName: response.data.data?.firstName,
              lastName: response.data.data?.lastName,
              dateOfBirth: response.data.data?.dateOfBirth,
              phoneNumber: response.data.data?.phoneNumber
            }
          }
        };
      } else {
        return {
          success: false,
          message: response.data?.message || 'NIN verification failed'
        };
      }

    } catch (error) {
      logger.error('NIN Verification Error:', error.message);
      throw error;
    }
  },

  async upgradeKYC(userId, kycData) {
    try {
      const {
        bvn,
        nin,
        idType,
        idNumber,
        address,
        occupation,
        annualIncome
      } = kycData;

      const payload = {
        userId,
        bvn,
        nin,
        idType, // 'passport', 'drivers_license', 'national_id'
        idNumber,
        address,
        occupation,
        annualIncome,
        upgradeTier: 'TIER_2' // or TIER_3
      };

      const response = await wemaApiClient.post('/customeridentification/v1/kyc-upgrade', payload);

      if (response.data && response.data.success) {
        return {
          success: true,
          data: {
            kycTier: response.data.data?.kycTier,
            upgradeDate: response.data.data?.upgradeDate,
            limits: response.data.data?.limits
          }
        };
      } else {
        throw new Error(response.data?.message || 'KYC upgrade failed');
      }

    } catch (error) {
      logger.error('KYC Upgrade Error:', error.message);
      throw error;
    }
  },

  async getCustomerProfile(customerId) {
    try {
      const response = await wemaApiClient.get(`/customeridentification/v1/customers/${customerId}`);

      return {
        success: true,
        data: response.data?.data
      };

    } catch (error) {
      logger.error('Get Customer Profile Error:', error.message);
      throw error;
    }
  }
};