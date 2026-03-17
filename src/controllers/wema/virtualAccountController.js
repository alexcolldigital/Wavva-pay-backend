// Virtual Account Controller
const virtualAccountService = require('../../services/wema/virtualAccountService');

module.exports = {
  async create(req, res) {
    try {
      const { userId } = req; // From auth middleware
      const userDetails = req.body;

      const result = await virtualAccountService.createVirtualAccount(userId, userDetails);

      res.json(result);
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

      const result = await virtualAccountService.getVirtualAccount(userId);

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
      const { userId } = req;
      const { startDate, endDate } = req.query;

      const result = await virtualAccountService.getVirtualAccountTransactions(userId, startDate, endDate);

      res.json(result);
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