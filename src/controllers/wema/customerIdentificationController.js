// Customer Identification Controller
const customerIdentificationService = require('../../services/wema/customerIdentificationService');

module.exports = {
  async verifyBVN(req, res) {
    try {
      const { bvn, phoneNumber } = req.body;

      const result = await customerIdentificationService.verifyBVN(bvn, phoneNumber);

      res.json(result);
    } catch (error) {
      console.error('BVN Verification Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'BVN verification failed'
      });
    }
  },

  async verifyNIN(req, res) {
    try {
      const { nin, phoneNumber } = req.body;

      const result = await customerIdentificationService.verifyNIN(nin, phoneNumber);

      res.json(result);
    } catch (error) {
      console.error('NIN Verification Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'NIN verification failed'
      });
    }
  },

  async upgradeKYC(req, res) {
    try {
      const { userId } = req;
      const kycData = req.body;

      const result = await customerIdentificationService.upgradeKYC(userId, kycData);

      res.json(result);
    } catch (error) {
      console.error('KYC Upgrade Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'KYC upgrade failed'
      });
    }
  },

  async getProfile(req, res) {
    try {
      const { customerId } = req.params;

      const result = await customerIdentificationService.getCustomerProfile(customerId);

      res.json(result);
    } catch (error) {
      console.error('Get Customer Profile Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get customer profile'
      });
    }
  }
};