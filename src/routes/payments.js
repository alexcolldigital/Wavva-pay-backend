const express = require('express');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { sendMoney, getTransactionStatus } = require('../services/chimoney');
const router = express.Router();

// Send money P2P
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { receiverId, amount, currency = 'USD', description } = req.body;
    const senderId = req.userId;
    
    // Validation
    if (!receiverId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount or receiver' });
    }
    
    // Get sender & receiver
    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);
    
    if (!sender || !receiver) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    // Check sender's balance
    const senderWallet = await Wallet.findById(sender.walletId);
    if (senderWallet.balance < amount * 100) { // Convert to cents
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Use Chimoney to send money
    const chimmoneyResult = await sendMoney(receiver.email, receiver.phone, amount, currency);
    
    if (!chimmoneyResult.success) {
      return res.status(400).json({ error: chimmoneyResult.error });
    }
    
    // Create transaction record
    const transaction = new Transaction({
      sender: senderId,
      receiver: receiverId,
      amount: amount * 100, // Store in cents
      currency,
      type: 'peer-to-peer',
      description,
      chimonyTransactionId: chimmoneyResult.transactionId,
      chimonyStatus: chimmoneyResult.status,
      status: 'completed',
      method: 'chimoney',
    });
    
    await transaction.save();
    
    // Update balances
    senderWallet.balance -= amount * 100;
    await senderWallet.save();
    
    const receiverWallet = await Wallet.findById(receiver.walletId);
    receiverWallet.balance += amount * 100;
    await receiverWallet.save();
    
    res.json({
      success: true,
      transactionId: transaction._id,
      chimonyTransactionId: chimmoneyResult.transactionId,
      message: 'Payment sent successfully',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Payment failed' });
  }
});

// Get transaction status
router.get('/transaction-status/:transactionId', authMiddleware, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const transaction = await Transaction.findById(transactionId);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Check Chimoney status
    const chimmoneyStatus = await getTransactionStatus(transaction.chimonyTransactionId);
    
    if (chimmoneyStatus) {
      transaction.chimonyStatus = chimmoneyStatus.status;
      await transaction.save();
    }
    
    res.json({
      transactionId: transaction._id,
      status: transaction.status,
      chimonyStatus: transaction.chimonyStatus,
      amount: transaction.amount / 100,
      currency: transaction.currency,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

module.exports = router;
