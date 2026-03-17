// Bank List Controller
const bankListService = require('../../services/wema/bankListService');

module.exports = {
  async list(req, res) {
    try {
      const result = await bankListService.getBankList();

      res.json(result);
    } catch (error) {
      console.error('Bank List Controller Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get bank list'
      });
    }
  }
};