const express = require('express');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { createTransfer, getTransferStatus, getBankList, initiateBankTransfer, resolveBankAccount } = require('../services/flutterwave');
const router = express.Router();

// Send money P2P (internal transfer)
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { receiverId, amount, currency = 'NGN', description } = req.body;
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
    const { amount, currency = 'NGN' } = req.body;
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

    const user = await User.findById(userId).populate('walletId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.walletId) {
      return res.status(404).json({ error: 'User wallet not found' });
    }

    const { verifyPayment } = require('../services/flutterwave');
    const verificationResult = await verifyPayment(transactionId);

    if (!verificationResult.success) {
      console.error('Verification failed:', verificationResult);
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
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const previousBalance = wallet.balance;
    wallet.balance += Math.round(verificationResult.amount * 100);
    await wallet.save();

    console.log(`Wallet updated: ${userId} | Previous: ${previousBalance} | Added: ${Math.round(verificationResult.amount * 100)} | New: ${wallet.balance}`);

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

// Get list of supported banks
router.get('/banks', authMiddleware, async (req, res) => {
  try {
    const { country = 'NG' } = req.query;
    
    const { getBankList } = require('../services/flutterwave');
    const banksResult = await getBankList(country);

    if (!banksResult.success) {
      return res.status(400).json({ error: banksResult.error });
    }

    res.json({
      success: true,
      banks: banksResult.banks,
    });
  } catch (err) {
    console.error('Bank list fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// Resolve bank account details
router.post('/resolve-account', authMiddleware, async (req, res) => {
  try {
    const { account_number, account_bank } = req.body;

    // Validation
    if (!account_number || !account_bank) {
      return res.status(400).json({ error: 'Account number and bank code required' });
    }

    const { resolveBankAccount } = require('../services/flutterwave');
    const resolveResult = await resolveBankAccount(account_number, account_bank);

    if (!resolveResult.success) {
      return res.status(400).json({ error: resolveResult.error });
    }

    res.json({
      success: true,
      accountName: resolveResult.accountName,
      accountNumber: resolveResult.accountNumber,
    });
  } catch (err) {
    console.error('Account resolution error:', err);
    res.status(500).json({ error: 'Failed to resolve account' });
  }
});

// Initiate bank transfer
router.post('/bank-transfer', authMiddleware, async (req, res) => {
  try {
    const { account_number, account_bank, amount, currency = 'NGN', description } = req.body;
    const userId = req.userId;

    // Validation
    if (!account_number || !account_bank || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid account details or amount' });
    }

    // Get user and wallet
    const user = await User.findById(userId).populate('walletId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.walletId) {
      return res.status(404).json({ error: 'User wallet not found' });
    }

    // Check wallet balance
    if (user.walletId.balance < amount * 100) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Initiate bank transfer
    const { initiateBankTransfer } = require('../services/flutterwave');
    const transferResult = await initiateBankTransfer(
      account_number,
      account_bank,
      amount,
      currency,
      description || 'Payment from Wavva Pay'
    );

    if (!transferResult.success) {
      return res.status(400).json({ error: transferResult.error });
    }

    // Create transaction record
    const transaction = new Transaction({
      sender: userId,
      receiver: null,
      amount: Math.round(amount * 100), // Store in cents
      currency,
      type: 'payout',
      status: 'pending', // Will update when bank confirms
      method: 'bank_transfer',
      flutterwaveTransactionId: transferResult.transferId,
      flutterwaveReference: transferResult.reference,
      description: description || `Bank transfer to ${account_number}`,
      metadata: {
        accountNumber: account_number,
        accountBank: account_bank,
        accountName: transferResult.accountName,
      },
    });

    await transaction.save();

    // Deduct amount from wallet (funds reserved for transfer)
    const wallet = await Wallet.findById(user.walletId);
    wallet.balance -= Math.round(amount * 100);
    await wallet.save();

    res.json({
      success: true,
      transactionId: transaction._id,
      transferId: transferResult.transferId,
      reference: transferResult.reference,
      status: transferResult.status,
      message: 'Bank transfer initiated',
      accountName: transferResult.accountName,
    });
  } catch (err) {
    console.error('Bank transfer error:', err);
    res.status(500).json({ error: 'Failed to initiate bank transfer' });
  }
});

// Get bank transfer status
router.get('/bank-transfer/:transferId', authMiddleware, async (req, res) => {
  try {
    const { transferId } = req.params;
    const userId = req.userId;

    // Find the transaction
    const transaction = await Transaction.findOne({
      flutterwaveTransactionId: transferId,
      sender: userId,
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    // Get status from Flutterwave
    const { getTransferStatus } = require('../services/flutterwave');
    const statusResult = await getTransferStatus(transferId);

    if (!statusResult.success) {
      return res.status(400).json({ error: statusResult.error });
    }

    // Update transaction status if different
    if (statusResult.status !== transaction.status) {
      transaction.status = statusResult.status;
      await transaction.save();
    }

    res.json({
      success: true,
      transactionId: transaction._id,
      transferId: transferId,
      status: statusResult.status,
      amount: transaction.amount / 100,
      currency: transaction.currency,
      reference: transaction.flutterwaveReference,
      accountNumber: transaction.metadata?.accountNumber,
      accountName: transaction.metadata?.accountName,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    });
  } catch (err) {
    console.error('Transfer status error:', err);
    res.status(500).json({ error: 'Failed to fetch transfer status' });
  }
});

module.exports = router;
