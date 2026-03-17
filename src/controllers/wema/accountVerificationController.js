// Account Verification Controller
const accountVerificationService = require('../../services/wema/accountVerificationService');

module.exports = {
  async verify(req, res) {
    try {
      const { account_number, bank_code } = req.body;

      const result = await accountVerificationService.verifyAccountNumber(account_number, bank_code);

      res.json(result);
    } catch (error) {
      console.error('Account Verification Controller Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Account verification failed'
      });
    }
  },

  async verifyIdentity(req, res) {
    try {
      const { bvn, phoneNumber } = req.body;

      const result = await accountVerificationService.verifyCustomerIdentity(bvn, phoneNumber);

      res.json(result);
    } catch (error) {
      console.error('Identity Verification Controller Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Identity verification failed'
      });
    }
  }
};