const express = require('express');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const router = express.Router();

// Chimoney sends webhook updates on payout status
router.post('/chimoney-status', async (req, res) => {
  try {
    const { transactionId, status } = req.body;

    // Find transaction by Chimoney ID
    const transaction = await Transaction.findOne({ chimonyTransactionId: transactionId });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update transaction status
    transaction.chimonyStatus = status;

    if (status === 'completed') {
      transaction.status = 'completed';
    } else if (status === 'failed') {
      transaction.status = 'failed';
      // Refund sender if payment failed
      const senderWallet = await Wallet.findById(transaction.sender.walletId);
      senderWallet.balance += transaction.amount;
      await senderWallet.save();
    }

    await transaction.save();

    res.json({ success: true, message: 'Transaction status updated' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
