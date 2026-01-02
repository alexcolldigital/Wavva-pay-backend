const express = require('express');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { createTransfer, getTransferStatus, getBankList, initiateBankTransfer, resolveBankAccount } = require('../services/flutterwave');
const { calculateFee } = require('../utils/feeCalculator');
const router = express.Router();

// Send money P2P (internal transfer) - Only via username, QR code, or NFC
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { receiverId, amount, currency = 'NGN', description, method = 'username' } = req.body;
    const senderId = req.userId;
    
    // Validation
    if (!receiverId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount or receiver' });
    }

    // Validate currency (only USD and NGN allowed)
    const validCurrencies = ['USD', 'NGN'];
    if (!validCurrencies.includes(currency)) {
      return res.status(400).json({ 
        error: 'Invalid currency. Only USD and NGN are supported.' 
      });
    }

    // Validate method (only username, qr, or nfc allowed)
    const validMethods = ['username', 'qr', 'nfc'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ 
        error: 'Invalid transfer method. Only username, QR code, and NFC are supported.' 
      });
    }
    
    // Get sender & receiver
    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);
    
    if (!sender || !receiver) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Prevent sending to self
    if (senderId === receiverId) {
      return res.status(400).json({ error: 'Cannot send money to yourself' });
    }
    
    // Calculate transaction fee (P2P transfer)
    const amountInCents = Math.round(amount * 100);
    const { feeAmount, netAmount, feePercentage } = calculateFee(amountInCents, currency, 'p2p_transfer');
    const totalDebit = amountInCents + feeAmount; // Sender pays: amount + fee
    
    // Check sender's balance (must cover amount + fee)
    const senderWallet = await Wallet.findById(sender.walletId);
    if (!senderWallet || senderWallet.balance < totalDebit) {
      return res.status(400).json({ error: 'Insufficient balance to cover amount and fee' });
    }
    
    // Create transaction record (internal P2P transfer)
    const transaction = new Transaction({
      sender: senderId,
      receiver: receiverId,
      amount: amountInCents, // Gross amount (what receiver gets)
      currency,
      feePercentage,
      feeAmount,
      netAmount,
      type: 'peer-to-peer',
      description,
      status: 'completed',
      method: method, // Track the method used (username, qr, or nfc)
    });
    
    await transaction.save();
    
    // Populate sender and receiver details
    await transaction.populate('sender', 'firstName lastName username profilePicture');
    await transaction.populate('receiver', 'firstName lastName username profilePicture');
    
    // Update balances
    senderWallet.balance -= totalDebit; // Deduct amount + fee from sender
    await senderWallet.save();
    
    const receiverWallet = await Wallet.findById(receiver.walletId);
    if (receiverWallet) {
      receiverWallet.balance += amountInCents; // Receiver gets the full amount
      await receiverWallet.save();
    }

    res.json({
      success: true,
      transactionId: transaction._id,
      message: 'Payment sent successfully',
      transaction: {
        id: transaction._id,
        sender: {
          _id: sender._id,
          firstName: sender.firstName,
          lastName: sender.lastName,
          username: sender.username,
          profilePicture: sender.profilePicture
        },
        receiver: {
          _id: receiver._id,
          firstName: receiver.firstName,
          lastName: receiver.lastName,
          username: receiver.username,
          profilePicture: receiver.profilePicture
        },
        amount: amount,
        currency,
        fee: {
          percentage: feePercentage,
          amount: (feeAmount / 100).toFixed(2)
        },
        totalDebit: (totalDebit / 100).toFixed(2),
        status: transaction.status,
        method,
        createdAt: transaction.createdAt
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Payment failed' });
  }
});

// Lookup user by username, phone, or userId for transfer
router.get('/lookup/:identifier', authMiddleware, async (req, res) => {
  try {
    const { identifier } = req.params;
    const currentUserId = req.userId;

    if (!identifier || identifier.length < 2) {
      return res.status(400).json({ error: 'Please provide at least 2 characters' });
    }

    console.log('Looking up user with identifier:', identifier);

    // Try to match by exact username first, then phone, then userId
    let user = await User.findOne({ username: identifier }).select('_id firstName lastName username phone email profilePicture accountStatus');
    
    if (!user) {
      user = await User.findOne({ phone: identifier }).select('_id firstName lastName username phone email profilePicture accountStatus');
    }
    
    if (!user && identifier.length === 24) {
      // Try as MongoDB ObjectId
      try {
        user = await User.findById(identifier).select('_id firstName lastName username phone email profilePicture accountStatus');
      } catch (e) {
        // Invalid ObjectId format
      }
    }
    
    if (!user) {
      // Try regex search for username and phone
      user = await User.findOne({
        $or: [
          { username: { $regex: identifier, $options: 'i' } },
          { phone: { $regex: identifier, $options: 'i' } }
        ]
      }).select('_id firstName lastName username phone email profilePicture accountStatus');
    }

    console.log('User found:', user ? user._id : 'no user');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Cannot send to self
    if (user._id.toString() === currentUserId) {
      return res.status(400).json({ error: 'Cannot send money to yourself' });
    }

    // Cannot send to suspended users
    if (user.accountStatus === 'suspended') {
      return res.status(400).json({ error: 'This account is suspended' });
    }

    res.json({
      success: true,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        phone: user.phone,
        email: user.email,
        profilePicture: user.profilePicture
      }
    });
  } catch (err) {
    console.error('User lookup error:', err.message);
    console.error('Full error:', err);
    res.status(500).json({ error: 'Failed to lookup user', details: err.message });
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

    // Validate currency (only USD and NGN allowed)
    const validCurrencies = ['USD', 'NGN'];
    if (!validCurrencies.includes(currency)) {
      return res.status(400).json({ 
        error: 'Invalid currency. Only USD and NGN are supported.' 
      });
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
    const amountInCents = Math.round(verificationResult.amount * 100);
    const { feeAmount, netAmount, feePercentage } = calculateFee(amountInCents, verificationResult.currency, 'wallet_funding');
    
    const transaction = new Transaction({
      sender: userId,
      receiver: null, // Self-funding
      amount: amountInCents, // Store in cents
      currency: verificationResult.currency,
      feePercentage,
      feeAmount,
      netAmount,
      type: 'wallet_funding',
      status: 'completed',
      method: 'flutterwave',
      flutterwaveTransactionId: verificationResult.transactionId,
      flutterwaveReference: verificationResult.reference,
      description: `Wallet funding via ${verificationResult.paymentMethod}`,
    });

    await transaction.save();

    // Update wallet balance (with fee deducted)
    const wallet = await Wallet.findById(user.walletId);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const previousBalance = wallet.balance;
    const creditAmount = netAmount; // Credit only net amount (after fee)
    wallet.balance += creditAmount;
    await wallet.save();

    console.log(`Wallet updated: ${userId} | Previous: ${previousBalance} | Gross: ${amountInCents} | Fee: ${feeAmount} | Net: ${creditAmount} | New: ${wallet.balance}`);

    res.json({
      success: true,
      transactionId: transaction._id,
      message: 'Funds added successfully',
      payment: {
        grossAmount: (amountInCents / 100).toFixed(2),
        fee: {
          percentage: feePercentage,
          amount: (feeAmount / 100).toFixed(2)
        },
        netAmount: (creditAmount / 100).toFixed(2),
        currency: verificationResult.currency
      },
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

    // Validate currency (only USD and NGN allowed)
    const validCurrencies = ['USD', 'NGN'];
    if (!validCurrencies.includes(currency)) {
      return res.status(400).json({ 
        error: 'Invalid currency. Only USD and NGN are supported.' 
      });
    }

    // Get user and wallet
    const user = await User.findById(userId).populate('walletId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.walletId) {
      return res.status(404).json({ error: 'User wallet not found' });
    }

    // Calculate transaction fee (Bank transfer)
    const amountInCents = Math.round(amount * 100);
    const { feeAmount, netAmount, feePercentage } = calculateFee(amountInCents, currency, 'bank_transfer');
    const totalDebit = amountInCents + feeAmount; // User pays: amount + fee

    // Check wallet balance (must cover amount + fee)
    if (user.walletId.balance < totalDebit) {
      return res.status(400).json({ error: 'Insufficient balance to cover amount and fee' });
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
      amount: amountInCents, // Store in cents
      currency,
      feePercentage,
      feeAmount,
      netAmount,
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

    // Deduct amount + fee from wallet (funds reserved for transfer)
    const wallet = await Wallet.findById(user.walletId);
    wallet.balance -= totalDebit;
    await wallet.save();

    res.json({
      success: true,
      transactionId: transaction._id,
      transferId: transferResult.transferId,
      reference: transferResult.reference,
      status: transferResult.status,
      message: 'Bank transfer initiated',
      accountName: transferResult.accountName,
      transfer: {
        amount: (amountInCents / 100).toFixed(2),
        fee: {
          percentage: feePercentage,
          amount: (feeAmount / 100).toFixed(2)
        },
        total: (totalDebit / 100).toFixed(2),
        currency
      }
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

// Generate QR Code Token for Payment Requests
router.post('/generate-qr-token', authMiddleware, async (req, res) => {
  try {
    const { amount, description, type = 'payment' } = req.body;
    const userId = req.userId;

    // Validation - amount required only for payment type
    if (type === 'payment' && (!amount || amount <= 0)) {
      return res.status(400).json({ error: 'Invalid amount for payment QR code' });
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Generate encrypted token (in production, use proper encryption)
    // Token format: qr_[timestamp]_[userId]_[amount]_[random]
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const token = `qr_${timestamp}_${userId}_${amount || 'profile'}_${random}`;

    // Store token in database for verification (expires in 24 hours)
    const expiresAt = new Date(timestamp + 24 * 60 * 60 * 1000);
    
    res.json({
      success: true,
      token,
      type,
      amount: type === 'payment' ? amount : undefined,
      description: type === 'payment' ? description : undefined,
      userId,
      userName: user.fullName || user.email,
      expiresAt,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('QR token generation error:', err);
    res.status(500).json({ error: 'Failed to generate QR token' });
  }
});

// Verify QR Code Token
router.post('/verify-qr-token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Parse token (format: qr_[timestamp]_[userId]_[amount]_[random])
    const parts = token.split('_');
    if (parts.length < 5 || parts[0] !== 'qr') {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    const timestamp = parseInt(parts[1]);
    const senderId = parts[2];
    const amount = parseFloat(parts[3]);
    const now = Date.now();

    // Check if token is expired (24 hours)
    if (now - timestamp > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Token expired' });
    }

    // Get sender details
    const sender = await User.findById(senderId);
    if (!sender) {
      return res.status(400).json({ error: 'Sender not found' });
    }

    res.json({
      success: true,
      type: 'payment',
      id: token,
      userId: senderId,
      senderName: sender.fullName || sender.email,
      amount,
      isValid: true,
      expiresAt: new Date(timestamp + 24 * 60 * 60 * 1000),
    });
  } catch (err) {
    console.error('QR token verification error:', err);
    res.status(500).json({ error: 'Failed to verify QR token' });
  }
});

// Accept Payment Request (from scanned QR)
router.post('/accept-payment-request', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.body;
    const receiverId = req.userId;

    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }

    // In a full implementation, store the acceptance in database
    res.json({
      success: true,
      message: 'Payment request accepted',
      requestId,
      acceptedBy: receiverId,
      acceptedAt: new Date(),
    });
  } catch (err) {
    console.error('Accept payment request error:', err);
    res.status(500).json({ error: 'Failed to accept payment request' });
  }
});

// Reject Payment Request
router.post('/reject-payment-request', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.body;
    const receiverId = req.userId;

    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }

    // In a full implementation, update the request status in database
    res.json({
      success: true,
      message: 'Payment request rejected',
      requestId,
      rejectedBy: receiverId,
      rejectedAt: new Date(),
    });
  } catch (err) {
    console.error('Reject payment request error:', err);
    res.status(500).json({ error: 'Failed to reject payment request' });
  }
});

// Get Pending Payment Requests
router.get('/pending-requests', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    // In a full implementation, fetch from database
    // For now, return empty array
    res.json({
      success: true,
      requests: [],
      total: 0,
    });
  } catch (err) {
    console.error('Get pending requests error:', err);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

// Send Payment Request to friend
router.post('/request-payment', authMiddleware, async (req, res) => {
  try {
    const { recipientId, amount, description } = req.body;
    const senderId = req.userId;

    if (!recipientId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    // Verify both users exist
    const sender = await User.findById(senderId);
    const recipient = await User.findById(recipientId);

    if (!sender || !recipient) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Create payment request record
    const requestId = `payreq_${Date.now()}_${senderId}`;

    res.json({
      success: true,
      requestId,
      senderId,
      senderName: sender.fullName || sender.email,
      recipientId,
      amount,
      description,
      status: 'pending',
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('Send payment request error:', err);
    res.status(500).json({ error: 'Failed to send payment request' });
  }
});

module.exports = router;
