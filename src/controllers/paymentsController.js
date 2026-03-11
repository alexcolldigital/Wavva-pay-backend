const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const CommissionLedger = require('../models/CommissionLedger');
// Flutterwave for payments, transfers, bills, airtime, data
const flutterwaveService = require('../services/flutterwave');
// Wema for virtual accounts, real bank accounts, interbank transfers
const wemaService = require('../services/wema');
const { calculateFee } = require('../utils/feeCalculator');
const { recordCommission } = require('../services/commissionService');

// Send money P2P (internal transfer)
const sendMoney = async (req, res) => {
  try {
    const { receiverId, receiver, amount, currency = 'NGN', description, method = 'username' } = req.body;
    const senderId = req.userId;
    
    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!receiverId && !receiver) {
      return res.status(400).json({ error: 'Either receiverId or receiver (username) is required' });
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
    
    // Get sender
    const sender = await User.findById(senderId);
    if (!sender) {
      return res.status(400).json({ error: 'Sender user not found' });
    }

    // Get receiver - either by ID or by username/identifier
    let receiverUser;
    if (receiverId) {
      receiverUser = await User.findById(receiverId);
    } else if (receiver) {
      // Look up by username first (exact match)
      receiverUser = await User.findOne({ username: receiver });
      
      // If not found, try as MongoDB ObjectId
      if (!receiverUser && receiver.length === 24) {
        try {
          receiverUser = await User.findById(receiver);
        } catch (e) {
          // Invalid ObjectId
        }
      }

      // If still not found, try partial username match (case-insensitive)
      if (!receiverUser) {
        receiverUser = await User.findOne({
          username: { $regex: receiver, $options: 'i' }
        });
      }
    }
    
    if (!sender || !receiverUser) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Prevent sending to self
    if (senderId === receiverUser._id.toString()) {
      return res.status(400).json({ error: 'Cannot send money to yourself' });
    }

    // Cannot send to suspended users
    if (receiverUser.accountStatus === 'suspended') {
      return res.status(400).json({ error: 'This account is suspended' });
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
      receiver: receiverUser._id,
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
    
    const receiverWallet = await Wallet.findById(receiverUser.walletId);
    if (receiverWallet) {
      receiverWallet.balance += amountInCents; // Receiver gets the full amount
      await receiverWallet.save();
    }

    // Record commission to internal ledger
    if (feeAmount > 0) {
      await recordCommission({
        transactionId: transaction._id,
        amount: feeAmount,
        currency,
        source: 'p2p_transfer',
        fromUser: senderId,
        toUser: receiverUser._id,
        feePercentage,
        grossAmount: amountInCents,
        description: `P2P transfer commission: ${sender.username} → ${receiverUser.username}`
      });
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
          _id: receiverUser._id,
          firstName: receiverUser.firstName,
          lastName: receiverUser.lastName,
          username: receiverUser.username,
          profilePicture: receiverUser.profilePicture
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
};

// Lookup user by username, phone, or userId for transfer
const lookupUser = async (req, res) => {
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
};

// Get transaction status
const getTransactionStatus = async (req, res) => {
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
};

// Initialize Paystack payment for adding funds
const initializeFunding = async (req, res) => {
  try {
    const { amount, currency = 'NGN' } = req.body;
    const userId = req.userId;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Validate currency (only NGN allowed for now)
    if (currency !== 'NGN') {
      return res.status(400).json({ 
        error: 'Only NGN currency is supported for wallet funding' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // For Flutterwave, we don't initialize remotely - card details come from frontend
    // This endpoint now provides payment initialization instructions
    const reference = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    res.json({
      success: true,
      message: 'Ready to accept card details. Send card details to /api/payments/fund/verify',
      reference: reference,
      email: user.email,
      amount: amount,
      currency: currency,
      instructions: 'Send card details (pan, cvv, expiry, pin) to process payment via Flutterwave'
    });
  } catch (err) {
    console.error('Fund initialization error:', err);
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
};

// Verify/Process payment with Flutterwave (accepts card details and verifies payment)
const verifyFunding = async (req, res) => {
  try {
    const { reference, cardDetails } = req.body;
    const userId = req.userId;
    const amount = req.body.amount || 0; // Amount that was being funded

    console.log('🔍 Flutterwave payment processing started:', { userId, reference });

    if (!reference) {
      return res.status(400).json({ error: 'Payment reference required' });
    }

    const user = await User.findById(userId).populate('walletId');
    if (!user) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.walletId) {
      console.error('❌ User wallet not found:', userId);
      return res.status(404).json({ error: 'User wallet not found' });
    }

    let verificationResult;

    // If card details provided, charge via Flutterwave
    if (cardDetails && cardDetails.pan && cardDetails.cvv && cardDetails.expiry && cardDetails.pin) {
      console.log('💳 Processing card charge via Flutterwave...');
      const amountInKobo = Math.round(amount * 100);
      
      // Split expiry (MMYY) into expiryMonth and expiryYear
      const expiryMonth = cardDetails.expiry.substring(0, 2);
      const expiryYear = '20' + cardDetails.expiry.substring(2, 4);
      
      const chargeResult = await flutterwaveService.initializeCardPayment(
        {
          cardNumber: cardDetails.pan,
          cvv: cardDetails.cvv,
          expiryMonth: expiryMonth,
          expiryYear: expiryYear
        },
        amountInKobo / 100, // Convert to NGN
        user.email,
        user.phone,
        { fullName: user.firstName + ' ' + user.lastName }
      );

      if (!chargeResult.success) {
        return res.status(400).json({ 
          error: 'Card charge failed',
          message: chargeResult.error,
          status: chargeResult.status 
        });
      }

      verificationResult = chargeResult;
    } else {
      // Otherwise, verify existing reference via Flutterwave
      console.log('🔍 Verifying existing payment reference...');
      // Assuming reference is the Flutterwave transaction ID
      verificationResult = await flutterwaveService.verifyPayment(reference);
    }

    console.log('✓ Flutterwave result:', verificationResult);

    if (!verificationResult.success) {
      console.error('❌ Payment processing failed:', verificationResult);
      return res.status(400).json({ 
        error: 'Payment processing failed',
        message: verificationResult.error,
        status: verificationResult.status 
      });
    }

    // Create transaction record
    const amountInCents = Math.round(verificationResult.amount * 100);
    const { feeAmount, netAmount, feePercentage } = calculateFee(amountInCents, 'NGN', 'wallet_funding');
    
    const transaction = new Transaction({
      sender: userId,
      receiver: null, // Self-funding
      amount: amountInCents, // Store in cents
      currency: verificationResult.currency || 'NGN',
      feePercentage,
      feeAmount,
      netAmount,
      type: 'wallet_funding',
      status: 'completed',
      method: 'flutterwave',
      paystackReference: verificationResult.reference,
      paystackTransactionId: verificationResult.transactionId,
      description: `Wallet funding via Flutterwave (${verificationResult.paymentMethod || 'card'})`,
    });

    await transaction.save();

    // Update wallet balance (with fee deducted) - Use dual wallet system
    const wallet = await Wallet.findById(user.walletId);
    if (!wallet) {
      console.error('❌ Wallet not found:', user.walletId);
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Get or create currency-specific wallet (NGN only for now)
    const currencyWallet = wallet.getOrCreateWallet('NGN');
    const previousBalance = currencyWallet.balance;
    const creditAmount = netAmount; // Credit only net amount (after fee)
    
    console.log('💰 Updating wallet balance:', {
      userId,
      currency: 'NGN',
      previousBalance,
      creditAmount,
      newBalance: previousBalance + creditAmount
    });
    
    // Update the currency-specific wallet balance
    currencyWallet.balance += creditAmount;
    
    // IMPORTANT: Mark the wallets array as modified for Mongoose to detect the change
    wallet.markModified('wallets');
    
    await wallet.save();

    // Record commission to internal ledger
    if (feeAmount > 0) {
      await recordCommission({
        transactionId: transaction._id,
        amount: feeAmount,
        currency: 'NGN',
        source: 'wallet_funding',
        fromUser: userId,
        feePercentage,
        grossAmount: amountInCents,
        description: `Wallet funding commission via Flutterwave (${verificationResult.paymentMethod || 'card'})`
      });
    }

    console.log(`✅ Wallet updated: ${userId} | Currency: NGN | Previous: ${previousBalance} | Gross: ${amountInCents} | Fee: ${feeAmount} | Net: ${creditAmount} | New: ${currencyWallet.balance}`);

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
        currency: 'NGN'
      },
      newBalance: currencyWallet.balance / 100,
    });
  } catch (err) {
    console.error('Fund verification error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};

// Get list of supported banks
const getBanks = async (req, res) => {
  try {
    const banksResult = await flutterwaveService.getBankList();

    if (!banksResult.success) {
      console.warn('Bank list failed, but got fallback:', banksResult.banks?.length);
      return res.status(400).json({ error: banksResult.error });
    }

    console.log(`Returning ${banksResult.banks?.length || 0} banks from Flutterwave`);
    
    res.json({
      success: true,
      banks: banksResult.banks,
      source: 'flutterwave',
      count: banksResult.banks?.length || 0,
    });
  } catch (err) {
    console.error('Bank list fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
};

// Resolve bank account details
const resolveAccount = async (req, res) => {
  try {
    const { account_number, account_bank } = req.body;

    // Validation
    if (!account_number || !account_bank) {
      return res.status(400).json({ error: 'Account number and bank code required' });
    }

    const resolveResult = await flutterwaveService.resolveBankAccount(account_number, account_bank);

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
};

// Initiate bank transfer
const initiateTransfer = async (req, res) => {
  try {
    const { account_number, account_bank, amount, currency = 'NGN', description } = req.body;
    const userId = req.userId;

    // Validation
    if (!account_number || !account_bank || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid account details or amount' });
    }

    // Validate currency (only NGN allowed for now)
    if (currency !== 'NGN') {
      return res.status(400).json({ 
        error: 'Only NGN currency is supported for bank transfers' 
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
    const wallet = await Wallet.findById(user.walletId);
    if (!wallet || wallet.balance < totalDebit) {
      return res.status(400).json({ error: 'Insufficient balance to cover amount and fee' });
    }

    // First, resolve the bank account to verify it exists
    const resolveResult = await flutterwaveService.resolveBankAccount(account_number, account_bank);
    
    if (!resolveResult.success) {
      return res.status(400).json({ error: 'Invalid bank account: ' + resolveResult.error });
    }

    // Use Flutterwave for the transfer
    const transferResult = await flutterwaveService.createTransfer(
      account_number,
      account_bank,
      amount,
      resolveResult.accountName,
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
      paystackReference: transferResult.reference,
      paystackTransactionId: transferResult.transferId,
      description: description || `Bank transfer to ${account_number}`,
      metadata: {
        accountNumber: account_number,
        bankCode: account_bank,
        accountName: resolveResult.accountName,
      },
    });

    await transaction.save();

    // Deduct amount + fee from wallet (funds reserved for transfer)
    wallet.balance -= totalDebit;
    await wallet.save();

    // Record commission to internal ledger
    if (feeAmount > 0) {
      await recordCommission({
        transactionId: transaction._id,
        amount: feeAmount,
        currency,
        source: 'bank_transfer',
        fromUser: userId,
        feePercentage,
        grossAmount: amountInCents,
        description: `Bank transfer commission to ${resolveResult.accountName}`
      });
    }

    res.json({
      success: true,
      transactionId: transaction._id,
      transferId: transferResult.transferId,
      reference: transferResult.reference,
      status: transferResult.status,
      message: 'Bank transfer initiated',
      accountName: resolveResult.accountName,
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
};

// Get bank transfer status
const getTransferStatusEndpoint = async (req, res) => {
  try {
    const { transferId } = req.params;
    const userId = req.userId;

    // Find the transaction
    const transaction = await Transaction.findOne({
      paystackTransactionId: transferId,
      sender: userId,
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    // Get status from Flutterwave
    const statusResult = await flutterwaveService.getTransferStatus(transferId);

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
      reference: transaction.paystackReference,
      accountNumber: transaction.metadata?.accountNumber,
      accountName: transaction.metadata?.accountName,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    });
  } catch (err) {
    console.error('Transfer status error:', err);
    res.status(500).json({ error: 'Failed to fetch transfer status' });
  }
};

// Generate QR Code Token for Payment Requests
const generateQrToken = async (req, res) => {
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
};

// Verify QR Code Token
const verifyQrToken = async (req, res) => {
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
};

// Accept Payment Request (from scanned QR)
const acceptPaymentRequest = async (req, res) => {
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
};

// Reject Payment Request
const rejectPaymentRequest = async (req, res) => {
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
};

// Get Pending Payment Requests
const getPendingRequests = async (req, res) => {
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
};

// Send Payment Request to friend
const requestPayment = async (req, res) => {
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
};

// Transfer funds between wallets (same user, different purposes/currencies)
const transferBetweenWallets = async (req, res) => {
  try {
    const { fromWalletPurpose = 'general', toWalletPurpose = 'general', amount, currency = 'NGN', description } = req.body;
    const userId = req.userId;
    
    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Validate currency
    const validCurrencies = ['USD', 'NGN'];
    if (!validCurrencies.includes(currency)) {
      return res.status(400).json({ 
        error: 'Invalid currency. Only USD and NGN are supported.' 
      });
    }

    // Cannot transfer to same wallet
    if (fromWalletPurpose === toWalletPurpose && currency === currency) {
      return res.status(400).json({ error: 'Cannot transfer to the same wallet' });
    }
    
    // Get user and wallets
    const user = await User.findById(userId).populate('walletId');
    if (!user || !user.walletId) {
      return res.status(400).json({ error: 'User or wallet not found' });
    }

    const wallet = user.walletId;
    const fromWallet = wallet.getWalletByPurpose(currency, fromWalletPurpose);
    
    if (!fromWallet) {
      return res.status(400).json({ error: `${fromWalletPurpose} ${currency} wallet not found` });
    }

    // Check balance
    const amountInCents = Math.round(amount * 100);
    if (fromWallet.balance < amountInCents) {
      return res.status(400).json({ error: 'Insufficient balance in source wallet' });
    }

    // Get or create destination wallet
    const toWallet = wallet.getOrCreateWallet(currency, toWalletPurpose);

    // Transfer funds
    fromWallet.balance -= amountInCents;
    toWallet.balance += amountInCents;

    // Mark wallets as modified
    wallet.markModified('wallets');
    await wallet.save();

    res.json({
      success: true,
      message: 'Funds transferred successfully',
      transfer: {
        from: {
          purpose: fromWalletPurpose,
          currency,
          balance: (fromWallet.balance / 100).toFixed(2)
        },
        to: {
          purpose: toWalletPurpose,
          currency,
          balance: (toWallet.balance / 100).toFixed(2)
        },
        amount: (amountInCents / 100).toFixed(2),
        description: description || 'Internal wallet transfer',
        timestamp: new Date()
      }
    });
  } catch (err) {
    console.error('Wallet transfer error:', err);
    res.status(500).json({ error: 'Failed to transfer funds between wallets' });
  }
};

// Send money via NFC Tag
const sendMoneyViaNFC = async (req, res) => {
  try {
    const { nfcTag, amount, currency = 'NGN', description } = req.body;
    const senderId = req.userId;
    
    // Validation
    if (!nfcTag || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid NFC tag or amount' });
    }

    // Validate currency (only USD and NGN allowed)
    const validCurrencies = ['USD', 'NGN'];
    if (!validCurrencies.includes(currency)) {
      return res.status(400).json({ 
        error: 'Invalid currency. Only USD and NGN are supported.' 
      });
    }
    
    // Find receiver by NFC tag
    const receiver = await User.findOne({ nfcTag });
    
    if (!receiver) {
      return res.status(400).json({ error: 'No user found with this NFC tag' });
    }

    // Prevent sending to self
    if (senderId === receiver._id.toString()) {
      return res.status(400).json({ error: 'Cannot send money to yourself' });
    }
    
    // Get sender & check balance
    const sender = await User.findById(senderId);
    if (!sender) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    // Calculate transaction fee (NFC transfer is same as P2P)
    const amountInCents = Math.round(amount * 100);
    const { feeAmount, netAmount, feePercentage } = calculateFee(amountInCents, currency, 'p2p_transfer');
    const totalDebit = amountInCents + feeAmount; // Sender pays: amount + fee
    
    // Check sender's balance (must cover amount + fee)
    const senderWallet = await Wallet.findById(sender.walletId);
    if (!senderWallet || senderWallet.balance < totalDebit) {
      return res.status(400).json({ error: 'Insufficient balance to cover amount and fee' });
    }
    
    // Create transaction record (NFC transfer)
    const transaction = new Transaction({
      sender: senderId,
      receiver: receiver._id,
      amount: amountInCents, // Gross amount (what receiver gets)
      currency,
      feePercentage,
      feeAmount,
      netAmount,
      type: 'peer-to-peer',
      description: description || 'NFC Transfer',
      status: 'completed',
      method: 'nfc',
      metadata: {
        nfcTag: nfcTag
      }
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

    // Record commission to internal ledger
    if (feeAmount > 0) {
      await recordCommission({
        transactionId: transaction._id,
        amount: feeAmount,
        currency,
        source: 'nfc_transfer',
        fromUser: senderId,
        toUser: receiver._id,
        feePercentage,
        grossAmount: amountInCents,
        description: `NFC transfer commission: ${sender.username} \u2192 ${receiver.username}`
      });
    }

    res.json({
      success: true,
      transactionId: transaction._id,
      message: 'Payment sent successfully via NFC',
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
        method: 'nfc',
        createdAt: transaction.createdAt
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'NFC payment failed' });
  }
};

const payBillEndpoint = async (req, res) => {
  try {
    const { providerId, accountNumber, amount } = req.body;
    const userId = req.userId;

    if (!providerId || !accountNumber || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields: providerId, accountNumber, amount' 
      });
    }

    const user = await User.findById(userId).populate('walletId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.walletId) {
      return res.status(404).json({ error: 'User wallet not found' });
    }

    const amountInKobo = Math.round(amount * 100);

    // Check wallet balance
    if (user.walletId.balance < amountInKobo) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        balance: user.walletId.balance / 100,
        required: amount
      });
    }

    // Process bill payment via Flutterwave
    const billResult = await flutterwaveService.payBill(providerId, accountNumber, amountInKobo, {
      email: user.email,
      phone: user.phone,
      description: `Bill payment for account ${accountNumber}`
    });

    if (!billResult.success) {
      return res.status(400).json({ 
        error: billResult.error,
        status: billResult.status
      });
    }

    // Create transaction record
    const transaction = new Transaction({
      sender: userId,
      receiver: null,
      amount: amountInKobo,
      currency: 'NGN',
      type: 'bill_payment',
      method: 'flutterwave',
      status: billResult.status === 'success' ? 'completed' : 'pending',
      paystackReference: billResult.reference,
      metadata: {
        providerId: providerId,
        accountNumber: accountNumber,
        billType: 'utility'
      }
    });

    await transaction.save();

    // Debit wallet
    user.walletId.balance -= amountInKobo;
    await user.walletId.save();

    // Record commission to internal ledger
    const commissionRate = user.settings?.commissionRate || 1.5;
    const commission = Math.round((amountInKobo * commissionRate) / 100);
    
    const commissionLedger = new CommissionLedger({
      transactionId: transaction._id,
      userId: userId,
      type: 'bill_payment',
      amount: amountInKobo,
      commission: commission,
      method: 'flutterwave',
      status: 'recorded'
    });

    await commissionLedger.save();

    res.json({
      success: true,
      transactionId: transaction._id,
      reference: billResult.reference,
      amount: amount,
      currency: 'NGN',
      status: transaction.status,
      newBalance: user.walletId.balance / 100,
      message: billResult.message
    });
  } catch (err) {
    console.error('Bill payment error:', err);
    res.status(500).json({ error: 'Bill payment failed: ' + err.message });
  }
};

// Buy Airtime
const buyAirtimeEndpoint = async (req, res) => {
  try {
    const { networkCode, phoneNumber, amount } = req.body;
    const userId = req.userId;

    if (!networkCode || !phoneNumber || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields: networkCode, phoneNumber, amount' 
      });
    }

    const user = await User.findById(userId).populate('walletId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.walletId) {
      return res.status(404).json({ error: 'User wallet not found' });
    }

    const amountInKobo = Math.round(amount * 100);

    // Check wallet balance
    if (user.walletId.balance < amountInKobo) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        balance: user.walletId.balance / 100,
        required: amount
      });
    }

    // Process airtime purchase via Flutterwave
    const airtimeResult = await flutterwaveService.buyAirtime(networkCode, phoneNumber, amount, {
      email: user.email,
      phone: phoneNumber,
      description: `Airtime purchase for ${phoneNumber}`
    });

    if (!airtimeResult.success) {
      return res.status(400).json({ 
        error: airtimeResult.error,
        status: airtimeResult.status
      });
    }

    // Create transaction record
    const transaction = new Transaction({
      sender: userId,
      receiver: null,
      amount: amountInKobo,
      currency: 'NGN',
      type: 'airtime',
      method: 'flutterwave',
      status: airtimeResult.status === 'success' ? 'completed' : 'pending',
      paystackReference: airtimeResult.reference,
      metadata: {
        networkCode: networkCode,
        phoneNumber: phoneNumber,
        serviceType: 'airtime'
      }
    });

    await transaction.save();

    // Debit wallet
    user.walletId.balance -= amountInKobo;
    await user.walletId.save();

    // Record commission to internal ledger
    const commissionRate = user.settings?.commissionRate || 1.5;
    const commission = Math.round((amountInKobo * commissionRate) / 100);
    
    const commissionLedger = new CommissionLedger({
      transactionId: transaction._id,
      userId: userId,
      type: 'airtime',
      amount: amountInKobo,
      commission: commission,
      method: 'flutterwave',
      status: 'recorded'
    });

    await commissionLedger.save();

    res.json({
      success: true,
      transactionId: transaction._id,
      reference: airtimeResult.reference,
      amount: amount,
      phoneNumber: phoneNumber,
      network: networkCode,
      currency: 'NGN',
      status: transaction.status,
      newBalance: user.walletId.balance / 100,
      message: airtimeResult.message
    });
  } catch (err) {
    console.error('Airtime purchase error:', err);
    res.status(500).json({ error: 'Airtime purchase failed: ' + err.message });
  }
};

// Buy Data Bundle
const buyDataBundleEndpoint = async (req, res) => {
  try {
    const { networkCode, phoneNumber, dataPlanId, amount } = req.body;
    const userId = req.userId;

    if (!networkCode || !phoneNumber || !dataPlanId || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields: networkCode, phoneNumber, dataPlanId, amount' 
      });
    }

    const user = await User.findById(userId).populate('walletId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.walletId) {
      return res.status(404).json({ error: 'User wallet not found' });
    }

    const amountInKobo = Math.round(amount * 100);

    // Check wallet balance
    if (user.walletId.balance < amountInKobo) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        balance: user.walletId.balance / 100,
        required: amount
      });
    }

    // Process data purchase via Flutterwave
    const dataResult = await buyDataBundle(networkCode, phoneNumber, dataPlanId, amountInKobo, {
      email: user.email,
      phone: phoneNumber,
      description: `Data bundle ${dataPlanId} for ${phoneNumber}`
    });

    if (!dataResult.success) {
      return res.status(400).json({ 
        error: dataResult.error,
        status: dataResult.status
      });
    }

    // Create transaction record
    const transaction = new Transaction({
      sender: userId,
      receiver: null,
      amount: amountInKobo,
      currency: 'NGN',
      type: 'data_bundle',
      method: 'flutterwave',
      status: dataResult.status === 'Successful' ? 'completed' : 'pending',
      paystackReference: dataResult.reference,
      metadata: {
        networkCode: networkCode,
        phoneNumber: phoneNumber,
        dataPlanId: dataPlanId,
        serviceType: 'data'
      }
    });

    await transaction.save();

    // Debit wallet
    user.walletId.balance -= amountInKobo;
    await user.walletId.save();

    // Record commission to internal ledger
    const commissionRate = user.settings?.commissionRate || 1.5;
    const commission = Math.round((amountInKobo * commissionRate) / 100);
    
    const commissionLedger = new CommissionLedger({
      transactionId: transaction._id,
      userId: userId,
      type: 'data_bundle',
      amount: amountInKobo,
      commission: commission,
      method: 'onepipe',
      status: 'recorded'
    });

    await commissionLedger.save();

    res.json({
      success: true,
      transactionId: transaction._id,
      reference: dataResult.reference,
      amount: amount,
      phoneNumber: phoneNumber,
      network: networkCode,
      dataPlan: dataPlanId,
      currency: 'NGN',
      status: transaction.status,
      newBalance: user.walletId.balance / 100,
      message: dataResult.message
    });
  } catch (err) {
    console.error('Data bundle purchase error:', err);
    res.status(500).json({ error: 'Data bundle purchase failed: ' + err.message });
  }
};

// Get Available Data Plans
const getDataPlansEndpoint = async (req, res) => {
  try {
    const { networkCode } = req.query;

    if (!networkCode) {
      return res.status(400).json({ error: 'networkCode query parameter is required' });
    }

    const dataPlans = getDataPlans(networkCode);

    if (dataPlans.length === 0) {
      return res.status(400).json({ 
        error: 'Network not supported',
        supportedNetworks: ['MTN', 'GLO', 'AIRTEL', '9MOBILE']
      });
    }

    res.json({
      success: true,
      network: networkCode,
      plans: dataPlans,
      count: dataPlans.length
    });
  } catch (err) {
    console.error('Get data plans error:', err);
    res.status(500).json({ error: 'Failed to fetch data plans' });
  }
};

// Get Available Bill Providers
const getBillProvidersEndpoint = async (req, res) => {
  try {
    const { category } = req.query;

    const billProviders = getBillProviders();

    if (category) {
      const providers = billProviders[category];
      if (!providers) {
        return res.status(400).json({ 
          error: 'Category not found',
          supportedCategories: Object.keys(billProviders)
        });
      }

      return res.json({
        success: true,
        category: category,
        providers: providers,
        count: providers.length
      });
    }

    // Return all providers by category
    res.json({
      success: true,
      providers: billProviders,
      categories: Object.keys(billProviders)
    });
  } catch (err) {
    console.error('Get bill providers error:', err);
    res.status(500).json({ error: 'Failed to fetch bill providers' });
  }
};

module.exports = {
  sendMoney,
  sendMoneyViaNFC,
  transferBetweenWallets,
  lookupUser,
  getTransactionStatus,
  initializeFunding,
  verifyFunding,
  getBanks,
  resolveAccount,
  initiateTransfer,
  getTransferStatus: getTransferStatusEndpoint,
  generateQrToken,
  verifyQrToken,
  acceptPaymentRequest,
  rejectPaymentRequest,
  getPendingRequests,
  requestPayment,
  payBill: payBillEndpoint,
  buyAirtime: buyAirtimeEndpoint,
  buyDataBundle: buyDataBundleEndpoint,
  getDataPlans: getDataPlansEndpoint,
  getBillProviders: getBillProvidersEndpoint,
};
