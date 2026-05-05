// NIP Transfer Controller
const nipTransferService = require('../../services/wema/nipTransferService');

module.exports = {
  async send(req, res) {
    try {
      const { userId } = req; // From auth middleware
      const transferData = req.body;

      const result = await nipTransferService.sendNipTransfer(userId, transferData);

      res.json(result);
    } catch (error) {
      console.error('NIP Transfer Controller Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Transfer failed'
      });
    }
  },

  async getStatus(req, res) {
    try {
      const { transactionReference } = req.params;

      const result = await nipTransferService.getTransferStatus(transactionReference);

      res.json(result);
    } catch (error) {
      console.error('Get Transfer Status Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get transfer status'
      });
    }
  }
};