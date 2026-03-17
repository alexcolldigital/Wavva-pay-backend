// Settlement Controller
const settlementService = require('../../services/wema/settlementService');

module.exports = {
  async get(req, res) {
    try {
      const result = await settlementService.getSettlementAccount();

      res.json(result);
    } catch (error) {
      console.error('Get Settlement Account Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get settlement account'
      });
    }
  },

  async getTransactions(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const result = await settlementService.getSettlementTransactions(startDate, endDate);

      res.json(result);
    } catch (error) {
      console.error('Get Settlement Transactions Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get settlement transactions'
      });
    }
  }
};