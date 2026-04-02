// Virtual Account Controller (now backed by Flutterwave)
const walletService = require('../../services/walletService');

module.exports = {
  async create(req, res) {
    try {
      const { userId } = req; // From auth middleware

      const result = await walletService.createVirtualAccountForUser(userId);

      // Return success or error
      // Note: VA is always created on first call, KYC only determines if it's permanent or temporary
      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Virtual Account Creation Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Virtual account creation failed'
      });
    }
  },

  async get(req, res) {
    try {
      const { userId } = req; // From auth middleware

      const result = await walletService.getWalletWithVirtualAccount(userId);

      res.json(result);
    } catch (error) {
      console.error('Get Virtual Account Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get virtual account'
      });
    }
  },

  async getTransactions(req, res) {
    try {
      // Flutterwave virtual account transaction queries are not yet implemented here
      // Use the general transactions endpoint or implement dedicated integration as needed
      return res.status(501).json({ success: false, message: 'Virtual account transaction retrieval not implemented for Flutterwave' });
    } catch (error) {
      console.error('Get Virtual Account Transactions Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get transactions'
      });
    }
  },

  async webhook(req, res) {
    try {
      const payload = req.body;

      const result = await virtualAccountService.handleVirtualAccountWebhook(payload);

      res.json(result);
    } catch (error) {
      console.error('Virtual Account Webhook Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Webhook processing failed'
      });
    }
  }
};