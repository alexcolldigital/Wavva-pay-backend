const express = require('express');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { createTransfer, getTransferStatus } = require('../services/flutterwave');
const router = express.Router();

// Send money P2P (internal transfer)
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
    
    // Create transaction record (internal P2P transfer)
    const transaction = new Transaction({
      sender: senderId,
      receiver: receiverId,
      amount: amount * 100, // Store in cents
      currency,
      type: 'peer-to-peer',
      description,
      status: 'completed',
      method: 'internal',
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
    
    res.json({
      transactionId: transaction._id,
      status: transaction.status,
      amount: transaction.amount / 100,
      currency: transaction.currency,
      type: transaction.type,
      createdAt: transaction.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Initialize Flutterwave payment for adding funds
router.post('/fund/initialize', authMiddleware, async (req, res) => {
  try {
    const { amount, currency = 'USD' } = req.body;
    const userId = req.userId;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { initializePayment } = require('../services/flutterwave');
    
    const paymentResult = await initializePayment(
      user.email,
      amount,
      currency,
      { userId: userId.toString(), type: 'wallet_funding' }
    );

    if (!paymentResult.success) {
      return res.status(400).json({ error: paymentResult.error });
    }

    res.json({
      success: true,
      paymentLink: paymentResult.paymentLink,
      transactionRef: paymentResult.transactionRef,
    });
  } catch (err) {
    console.error('Fund initialization error:', err);
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
});

// Verify Flutterwave payment and credit wallet
router.post('/fund/verify', authMiddleware, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const userId = req.userId;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { verifyPayment } = require('../services/flutterwave');
    const verificationResult = await verifyPayment(transactionId);

    if (!verificationResult.success) {
      return res.status(400).json({ 
        error: 'Payment verification failed',
        status: verificationResult.status 
      });
    }

    // Create transaction record
    const transaction = new Transaction({
      sender: userId,
      receiver: null, // Self-funding
      amount: Math.round(verificationResult.amount * 100), // Store in cents
      currency: verificationResult.currency,
      type: 'wallet_funding',
      status: 'completed',
      method: 'flutterwave',
      flutterwaveTransactionId: verificationResult.transactionId,
      flutterwaveReference: verificationResult.reference,
      description: `Wallet funding via ${verificationResult.paymentMethod}`,
    });

    await transaction.save();

    // Update wallet balance
    const wallet = await Wallet.findById(user.walletId);
    wallet.balance += Math.round(verificationResult.amount * 100);
    await wallet.save();

    res.json({
      success: true,
      transactionId: transaction._id,
      message: 'Funds added successfully',
      newBalance: wallet.balance / 100,
    });
  } catch (err) {
    console.error('Fund verification error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

module.exports = router;
