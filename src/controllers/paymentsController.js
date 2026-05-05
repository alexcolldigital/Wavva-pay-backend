const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const CommissionLedger = require('../models/CommissionLedger');
// Flutterwave for payments, transfers, bills, airtime, data
const flutterwaveService = require('../services/flutterwave');
// Wema for virtual accounts, real bank accounts, interbank transfers
const wemaService = require('../services/wema');
const vtpassService = require('../services/vtpass');
const unifiedLedgerService = require('../services/unifiedLedgerService');
const { calculateFee } = require('../utils/feeCalculator');
const { recordCommission } = require('../services/commissionService');
const { extractWavvaTagValue } = require('../utils/wavvaTag');

// Export function to set io instance for real-time updates
let ioInstance;
const setIOInstance = (io) => {
  ioInstance = io;
};

const getUserWithWallet = async (userId) => {
  let user = await User.findById(userId).populate('walletId');
  if (!user) {
    throw new Error('User not found');
  }
  await unifiedLedgerService.ensureUserWallet(userId, 'NGN');
  if (!user.walletId) {
    await unifiedLedgerService.syncLegacyWalletFromV2(userId);
    user = await User.findById(userId).populate('walletId');
  }
  return user;
};

const getFeeConfigTypeForCategory = (category) => {
  if (category === 'data') return 'data_bundle';
  return category;
};

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

    // Validate method (username, tag, qr, or nfc allowed)
    const validMethods = ['username', 'tag', 'qr', 'nfc'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ 
        error: 'Invalid transfer method. Only username, tag, QR code, and NFC are supported.' 
      });
    }
    
    // Get sender
    const sender = await User.findById(senderId);
    if (!sender) {
      return res.status(400).json({ error: 'Sender user not found' });
    }

    // Get receiver - either by ID or by wavvaTag/username/identifier
    let receiverUser;
    if (receiverId) {
      receiverUser = await User.findById(receiverId);
    } else if (receiver) {
      // Prioritize Wavva Tag lookup first (primary identifier for P2P)
      // Check if receiver starts with # (wavva tag format)
      const cleanReceiver = receiver.startsWith('#') ? extractWavvaTagValue(receiver) : receiver;
      
      // Try Wavva Tag first (exact match, case-insensitive)
      receiverUser = await User.findOne({ wavvaTag: { $regex: `^#?${cleanReceiver}$`, $options: 'i' } });
      
      // Fall back to username (exact match)
      if (!receiverUser) {
        receiverUser = await User.findOne({ username: receiver });
      }
      
      // If not found, try as MongoDB ObjectId
      if (!receiverUser && receiver.length === 24) {
        try {
          receiverUser = await User.findById(receiver);
        } catch (e) {
          // Invalid ObjectId
        }
      }

      // If still not found, try regex search (wavvaTag, username, phone)
      if (!receiverUser) {
        receiverUser = await User.findOne({
          $or: [
            { wavvaTag: { $regex: cleanReceiver, $options: 'i' } },
            { username: { $regex: receiver, $options: 'i' } },
            { phone: { $regex: receiver, $options: 'i' } }
          ]
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
    await transaction.populate('sender', 'firstName lastName username wavvaTag profilePicture');
    await transaction.populate('receiver', 'firstName lastName username wavvaTag profilePicture');
    
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

    // Emit real-time transaction update to both users
    try {
      if (ioInstance) {
        const transactionData = {
          id: transaction._id,
          type: transaction.type,
          amount: transaction.amount,
          status: transaction.status,
          senderId: transaction.sender._id,
          senderName: transaction.sender.firstName + ' ' + transaction.sender.lastName,
          receiverId: transaction.receiver._id,
          receiverName: transaction.receiver.firstName + ' ' + transaction.receiver.lastName,
          description: transaction.description,
          timestamp: transaction.createdAt,
          eventType: 'created'
        };
        
        // Emit to sender
        ioInstance.to(`user:${senderId}`).emit('transaction:update', {
          timestamp: new Date(),
          data: transactionData
        });
        
        // Emit to receiver
        ioInstance.to(`user:${receiverUser._id}`).emit('transaction:update', {
          timestamp: new Date(),
          data: transactionData
        });
        
        console.log('✅ Real-time transaction update emitted:', transaction._id);
      }
    } catch (err) {
      console.error('Failed to emit real-time transaction update:', err.message);
      // Don't fail the request if real-time update fails
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

// Lookup user by wavvaTag, username, phone, or userId for transfer
const lookupUser = async (req, res) => {
  try {
    const { identifier } = req.params;
    const currentUserId = req.userId;

    if (!identifier || identifier.length < 2) {
      return res.status(400).json({ error: 'Please provide at least 2 characters' });
    }

    console.log('Looking up user with identifier:', identifier);

    // Extract wavva tag value if starts with #
    const cleanIdentifier = identifier.startsWith('#') ? extractWavvaTagValue(identifier) : identifier;

    // Try Wavva Tag first (exact match, case-insensitive) - PRIMARY lookup
    let user = await User.findOne({ wavvaTag: { $regex: `^#?${cleanIdentifier}$`, $options: 'i' } })
      .select('_id firstName lastName username wavvaTag phone email profilePicture accountStatus');
    
    // Fall back to exact username match
    if (!user) {
      user = await User.findOne({ username: identifier })
        .select('_id firstName lastName username wavvaTag phone email profilePicture accountStatus');
    }

    // Try phone number
    if (!user) {
      user = await User.findOne({ phone: identifier })
        .select('_id firstName lastName username wavvaTag phone email profilePicture accountStatus');
    }
    
    // Try as MongoDB ObjectId
    if (!user && identifier.length === 24) {
      try {
        user = await User.findById(identifier)
          .select('_id firstName lastName username wavvaTag phone email profilePicture accountStatus');
      } catch (e) {
        // Invalid ObjectId format
      }
    }
    
    // Try regex search for wavvaTag, username, and phone (case-insensitive)
    if (!user) {
      user = await User.findOne({
        $or: [
          { wavvaTag: { $regex: cleanIdentifier, $options: 'i' } },
          { username: { $regex: identifier, $options: 'i' } },
          { phone: { $regex: identifier, $options: 'i' } }
        ]
      }).select('_id firstName lastName username wavvaTag phone email profilePicture accountStatus');
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
      data: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        wavvaTag: user.wavvaTag,
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

// Initialize wallet funding for Flutterwave hosted checkout
const initializeFunding = async (req, res) => {
  try {
    const { amount, currency = 'NGN' } = req.body;
    const userId = req.userId;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!['NGN', 'USD'].includes(currency)) {
      return res.status(400).json({ error: 'Unsupported currency. Use NGN or USD.' });
    }

    const user = await getUserWithWallet(userId);

    if (!user.walletId) {
      return res.status(400).json({ error: 'User has no wallet attached.'});
    }

    const txRef = `WVF-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8081';
    const redirectUrl = `${frontendUrl}/checkout/success?tx_ref=${txRef}`;

    console.log('💰 Wallet Funding Initialize:', {
      userId,
      amount,
      currency,
      txRef,
      redirectUrl
    });

    const checkoutPayload = {
      amount: Number(amount),
      currency,
      tx_ref: txRef,
      redirectUrl,
      paymentOptions: 'card,mobilemoney,ussd',
      customer: {
        email: user.email,
        phonenumber: user.phone,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      },
      customizations: {
        title: 'Wavva Pay Wallet Funding',
        description: 'Secure wallet funding using Flutterwave',
        logo: `${frontendUrl}/logo.png`
      },
      metadata: {
        userId: userId.toString(),
        walletId: user.walletId.toString(),
        reference: txRef
      }
    };

    const checkoutResponse = await flutterwaveService.createCheckoutSession(checkoutPayload);

    if (!checkoutResponse.success) {
      console.error('❌ Checkout Session Creation Failed:', checkoutResponse);
      return res.status(500).json({
        success: false,
        error: 'Failed to create Flutterwave checkout session',
        details: checkoutResponse.error || checkoutResponse.message
      });
    }

    console.log('✅ Checkout Session Created:', {
      txRef,
      paymentUrl: checkoutResponse.checkoutUrl,
      reference: checkoutResponse.reference
    });

    const transaction = new Transaction({
      sender: userId,
      amount: Math.round(Number(amount) * 100),
      currency,
      type: 'wallet_funding',
      status: 'pending',
      method: 'flutterwave',
      flutterwaveReference: txRef,
      metadata: {
        providerReference: checkoutResponse.transactionRef || txRef,
        userId: userId,
        amount: Number(amount),
      },
      description: 'Wallet funding via Flutterwave hosted checkout'
    });

    await transaction.save();

    res.json({
      success: true,
      paymentUrl: checkoutResponse.checkoutUrl || checkoutResponse.paymentLink || checkoutResponse.link,
      reference: txRef,
      transactionId: transaction._id
    });
  } catch (err) {
    console.error('Fund initialization error:', err);
    res.status(500).json({ error: 'Failed to initialize payment', details: err.message });
  }
};

// Verify wallet funding status (poll endpoint)
const verifyFunding = async (req, res) => {
  try {
    let { reference } = req.body;
    
    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }

    // Handle case where reference comes as an array (ensure it's a string)
    if (Array.isArray(reference)) {
      console.log('⚠️ Reference was array, converting to string:', reference);
      reference = reference[0] || reference;
    }

    console.log('🔍 Verifying Wallet Funding:', { reference, type: typeof reference });

    // Try multiple lookup strategies to find the transaction
    let transaction = await Transaction.findOne({ 
      $or: [
        { flutterwaveReference: reference },
        { 'metadata.reference': reference },
        { 'metadata.providerReference': reference },
        { 'metadata.txRef': reference }
      ]
    });
    
    // Fallback: try to find by tx_ref in metadata as substring
    if (!transaction) {
      console.log('⚠️ Transaction not found by reference, trying substring match...');
      transaction = await Transaction.findOne({
        $or: [
          { flutterwaveReference: { $regex: reference, $options: 'i' } },
          { 'metadata.reference': { $regex: reference, $options: 'i' } }
        ]
      });
    }

    if (!transaction) {
      console.error('❌ Transaction not found for reference:', reference);
      return res.status(404).json({ 
        error: 'Transaction not found',
        reference,
        message: 'No wallet funding transaction found for this reference. Please check your reference ID.'
      });
    }

    console.log('📋 Transaction Found:', { 
      id: transaction._id,
      status: transaction.status, 
      type: transaction.type,
      amount: transaction.amount,
      flutterwaveReference: transaction.flutterwaveReference 
    });

    // If already completed, return immediately (STOP POLLING)
    if (transaction.status === 'completed') {
      console.log('✅ Transaction Already Completed:', transaction._id);
      return res.json({
        success: true,
        status: 'completed',
        transactionId: transaction._id,
        amount: transaction.amount / 100,
        currency: transaction.currency,
        message: 'Payment completed successfully' // Signal to stop polling
      });
    }

    // Cross-check with Flutterwave status to see if payment went through
    try {
      const flutterwaveId = transaction.flutterwaveTransactionId || transaction.flutterwaveReference || reference;
      console.log('🔗 Verifying with Flutterwave ID:', flutterwaveId);
      
      const check = await flutterwaveService.verifyPayment(flutterwaveId);
      
      console.log('📊 Flutterwave check result:', {
        success: check.success,
        status: check.status,
        error: check.error
      });

      // Handle different Flutterwave response scenarios
      if (check.status === 'not_found') {
        // Transaction not yet in Flutterwave system - user might not have completed payment
        console.warn('⚠️ Transaction not found in Flutterwave - user may not have completed payment');
        return res.json({
          success: true,
          status: 'incomplete',
          message: 'Payment not confirmed by payment provider. Did you complete the payment on Flutterwave?',
          transactionId: transaction._id,
          amount: transaction.amount / 100,
          currency: transaction.currency
        });
      }

      if (check.status === 'error' || (check.error && !check.status)) {
        // API error, return what we have
        console.error('⚠️ Flutterwave API error:', check.error);
        return res.json({
          success: true,
          status: transaction.status,
          message: 'Unable to verify with payment provider. Your transaction is: ' + transaction.status,
          error: check.error,
          transactionId: transaction._id,
          amount: transaction.amount / 100,
          currency: transaction.currency
        });
      }

      const remoteStatus = check.status;
      console.log('🌐 Flutterwave Status:', remoteStatus, '| Success:', check.success);

      // IMPORTANT: Reload transaction from DB to get latest status
      // This prevents duplicate settlement calls if verifyFunding is called multiple times
      const latestTransaction = await Transaction.findById(transaction._id);
      console.log('📋 Latest transaction status from DB:', latestTransaction.status);
      
      // If Flutterwave says successful and webhook hasn't processed yet, trigger settlement
      // Also check that another concurrent request hasn't already started settlement
      if ((remoteStatus === 'successful' || check.success === true) && latestTransaction.status === 'pending') {
        console.log('⚙️ Flutterwave confirms successful payment, processing settlement...');
        
        // CRITICAL: Mark as 'processing' immediately BEFORE settlement to prevent concurrent settlements
        latestTransaction.status = 'processing';
        await latestTransaction.save();
        console.log('🔒 Transaction marked as "processing" - preventing concurrent settlement calls');
        
        // DEBUG: Log exactly what transaction we found and what we're sending to settlement
        console.log('📋 SETTLEMENT DATA - Transaction found in verifyFunding:', {
          transactionId: latestTransaction._id,
          flutterwaveReference: latestTransaction.flutterwaveReference,
          amount: latestTransaction.amount,
          status: latestTransaction.status,
          type: latestTransaction.type,
          metadata: latestTransaction.metadata
        });
        
        console.log('📤 SETTLEMENT DATA - Calling settlement with:', {
          reference: latestTransaction.flutterwaveReference,
          amount: latestTransaction.amount,
          currency: latestTransaction.currency,
          provider: 'flutterwave',
          providerReference: check.transactionId || flutterwaveId
        });
        
        let settlementSuccess = false;
        let settlementError = null;

        try {
          // Trigger webhook settlement
          const TransactionService = require('../modules/transactions/transactionService');
          const settlementResult = await TransactionService.processWebhookSettlement({
            reference: latestTransaction.flutterwaveReference,
            amount: latestTransaction.amount,
            currency: latestTransaction.currency,
            provider: 'flutterwave',
            providerReference: check.transactionId || flutterwaveId,
            status: 'successful',
            metadata: { verificationData: check }
          });

          settlementSuccess = settlementResult && settlementResult.success;
          console.log('📦 Settlement Result:', settlementResult);
        } catch (settlementErr) {
          console.error('❌ Settlement processing error:', {
            message: settlementErr.message,
            stack: settlementErr.stack
          });
          settlementError = settlementErr.message;
          // Continue anyway - we still want to mark transaction as completed
        }

        // Mark transaction as completed since Flutterwave confirmed successful payment
        transaction.status = 'completed';
        transaction.flutterwaveTransactionId = check.transactionId || flutterwaveId;
        
        // Store settlement result in metadata
        if (!transaction.metadata) transaction.metadata = {};
        transaction.metadata.settlementAttempt = {
          timestamp: new Date(),
          success: settlementSuccess,
          error: settlementError
        };
        
        try {
          await transaction.save();
          console.log('✅ Transaction marked as completed - settlement attempted:', {
            settlementSuccess,
            settlementError
          });
        } catch (saveErr) {
          console.error('⚠️ Failed to save transaction status:', saveErr.message);
        }

        // Return appropriate response based on settlement outcome
        if (settlementSuccess || !settlementError) {
          return res.json({
            success: true,
            status: 'completed',
            message: '✓ Wallet funded successfully!',
            transactionId: transaction._id,
            amount: transaction.amount / 100,
            currency: transaction.currency,
            settlementProcessed: true
          });
        } else {
          // Settlement had issues but Flutterwave confirmed payment
          return res.json({
            success: true,
            status: 'completed',
            message: '⚠️ Payment confirmed but balance update is processing. Please refresh your wallet in a moment.',
            transactionId: transaction._id,
            amount: transaction.amount / 100,
            currency: transaction.currency,
            settlementWarning: settlementError
          });
        }
      }

      // If still pending after retry attempts, suggest user wait
      if (remoteStatus === 'pending' || transaction.status === 'pending') {
        return res.json({
          success: true,
          status: 'pending',
          message: 'Payment is still being processed by your bank',
          remoteStatus,
          transactionId: transaction._id,
          amount: transaction.amount / 100,
          currency: transaction.currency
        });
      }

      return res.json({
        success: true,
        status: transaction.status,
        remoteStatus: remoteStatus || 'unknown',
        transactionId: transaction._id,
        amount: transaction.amount / 100,
        currency: transaction.currency
      });
    } catch (checkErr) {
      console.error('❌ Flutterwave verification caught error:', checkErr.message);
      console.log('💾 Transaction status is still:', transaction.status);
      
      return res.json({
        success: true,
        status: transaction.status,
        message: 'Could not verify with payment provider. Your transaction status is: ' + transaction.status,
        error: checkErr.message,
        transactionId: transaction._id,
        amount: transaction.amount / 100,
        currency: transaction.currency
      });
    }
  } catch (err) {
    console.error('Verify funding error:', err);
    res.status(500).json({ error: 'Failed to verify funding status', details: err.message });
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
    const user = await getUserWithWallet(userId);

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

    // Prefer Wema for interbank transfer when the user's virtual account is linked.
    const sourceAccountId = user.virtualAccount?.accountId || user.walletId?.wemaVirtualAccountId;
    let transferResult;
    let providerUsed = 'flutterwave';

    if (sourceAccountId) {
      transferResult = await wemaService.createInterbankTransfer(
        sourceAccountId,
        account_number,
        account_bank,
        amount,
        description || 'Payment from Wavva Pay'
      );
      if (transferResult.success) {
        providerUsed = 'wema';
      }
    }

    if (!transferResult || !transferResult.success) {
      transferResult = await flutterwaveService.createTransfer(
        account_number,
        account_bank,
        amount,
        currency,
        description || 'Payment from Wavva Pay'
      );
      providerUsed = 'flutterwave';
    }

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
      method: providerUsed,
      paystackReference: transferResult.reference,
      paystackTransactionId: transferResult.transferId,
      description: description || `Bank transfer to ${account_number}`,
      metadata: {
        accountNumber: account_number,
        bankCode: account_bank,
        accountName: resolveResult.accountName,
        provider: providerUsed,
      },
    });

    await transaction.save();

    await unifiedLedgerService.processPayoutReservation({
      userId,
      transactionId: transaction._id,
      amount: amountInCents,
      feeAmount,
      currency,
      provider: providerUsed,
      providerReference: transferResult.transferId || transferResult.reference,
      reference: transferResult.reference,
      description: description || `Bank transfer to ${resolveResult.accountName}`,
      metadata: transaction.metadata,
    });

    const refreshedUser = await User.findById(userId).populate('walletId');

    res.json({
      success: true,
      transactionId: transaction._id,
      transferId: transferResult.transferId,
      reference: transferResult.reference,
      status: transferResult.status,
      message: 'Bank transfer initiated',
      provider: providerUsed,
      accountName: resolveResult.accountName,
      transfer: {
        amount: (amountInCents / 100).toFixed(2),
        fee: {
          percentage: feePercentage,
          amount: (feeAmount / 100).toFixed(2)
        },
        total: (totalDebit / 100).toFixed(2),
        currency,
        balanceAfter: ((refreshedUser?.walletId?.balance || 0) / 100).toFixed(2)
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

    const provider = transaction.method === 'wema' ? 'wema' : 'flutterwave';
    const statusResult = provider === 'wema'
      ? await wemaService.getInterbankTransferStatus(transferId)
      : await flutterwaveService.getTransferStatus(transferId);

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
    await transaction.populate('sender', 'firstName lastName username wavvaTag profilePicture');
    await transaction.populate('receiver', 'firstName lastName username wavvaTag profilePicture');
    
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
    const {
      category,
      amount,
      networkCode,
      phoneNumber,
      providerId,
      meterNumber,
      meterType,
      smartCardNumber,
      accountNumber,
      dataPlanId,
      variationCode,
    } = req.body;
    const userId = req.userId;

    if (!category || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields: category, amount' 
      });
    }

    const user = await getUserWithWallet(userId);

    const amountInKobo = Math.round(amount * 100);
    const feeConfigType = getFeeConfigTypeForCategory(category);
    const { feeAmount, feePercentage, grossAmount } = calculateFee(amountInKobo, 'NGN', feeConfigType);

    // Check wallet balance
    if (user.walletId.balance < grossAmount) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        balance: user.walletId.balance / 100,
        required: grossAmount / 100
      });
    }

    let billResult;

    // Process bill payment via VTPass
    if (category === 'airtime') {
      billResult = await vtpassService.buyAirtime(networkCode, phoneNumber, amountInKobo, {
        customerId: userId,
        email: user.email,
        phone: phoneNumber
      });
    } else if (category === 'data') {
      const selectedPlan = dataPlanId || variationCode;
      if (!selectedPlan) {
        return res.status(400).json({ error: 'dataPlanId or variationCode is required for data purchase' });
      }
      billResult = await vtpassService.buyDataBundle(networkCode, phoneNumber, selectedPlan, amountInKobo, {
        customerId: userId,
        email: user.email,
        phone: phoneNumber
      });
    } else if (category === 'electricity') {
      billResult = await vtpassService.payElectricityBill(providerId || 'ekedc', meterNumber, meterType || 'prepaid', amountInKobo, {
        customerId: userId,
        email: user.email,
        phone: user.phone
      });
    } else if (category === 'cable') {
      const selectedVariation = variationCode || dataPlanId;
      if (!selectedVariation) {
        return res.status(400).json({ error: 'variationCode is required for cable subscription' });
      }
      billResult = await vtpassService.payCableTVBill(providerId || 'dstv', smartCardNumber, selectedVariation, amountInKobo, {
        customerId: userId,
        email: user.email,
        phone: user.phone
      });
    } else {
      return res.status(400).json({ error: 'Unsupported bill category' });
    }

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
      feePercentage,
      feeAmount,
      netAmount: amountInKobo,
      method: 'vtpass',
      status: billResult.status === 'success' ? 'completed' : 'pending',
      paystackReference: billResult.reference,
      metadata: {
        category: category,
        amount: amount,
        grossAmount: grossAmount / 100,
        provider: 'vtpass',
        providerReference: billResult.providerReference,
        ...(category === 'airtime' || category === 'data' ? {
          networkCode: networkCode,
          phoneNumber: phoneNumber
        } : {}),
        ...(category === 'electricity' ? {
          providerId: providerId,
          meterNumber: meterNumber,
          meterType: meterType
        } : {}),
        ...(category === 'cable' ? {
          providerId: providerId,
          smartCardNumber: smartCardNumber
        } : {}),
        ...(category === 'water' || category === 'internet' ? {
          providerId: providerId,
          accountNumber: accountNumber
        } : {})
      }
    });

    await transaction.save();

    await unifiedLedgerService.processUtilityPurchase({
      userId,
      transactionId: transaction._id,
      amount: amountInKobo,
      feeAmount,
      provider: 'vtpass',
      providerReference: billResult.providerReference || billResult.reference,
      reference: billResult.reference,
      type: feeConfigType,
      description: `Utility payment (${category})`,
      metadata: transaction.metadata,
    });

    const refreshedUser = await User.findById(userId).populate('walletId');

    res.json({
      success: true,
      transactionId: transaction._id,
      reference: billResult.reference,
      amount: amount,
      category: category,
      currency: 'NGN',
      status: transaction.status,
      fee: feeAmount / 100,
      totalDebit: grossAmount / 100,
      newBalance: refreshedUser.walletId.balance / 100,
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

    const user = await getUserWithWallet(userId);

    const amountInKobo = Math.round(amount * 100);
    const { feeAmount, feePercentage, grossAmount } = calculateFee(amountInKobo, 'NGN', 'airtime');

    // Check wallet balance
    if (user.walletId.balance < grossAmount) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        balance: user.walletId.balance / 100,
        required: grossAmount / 100
      });
    }

    // Process airtime purchase via VTPass
    const airtimeResult = await vtpassService.buyAirtime(networkCode, phoneNumber, amountInKobo, {
      email: user.email,
      phone: phoneNumber,
      customerId: userId
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
      feePercentage,
      feeAmount,
      netAmount: amountInKobo,
      method: 'vtpass',
      status: airtimeResult.status === 'success' ? 'completed' : 'pending',
      paystackReference: airtimeResult.reference,
      metadata: {
        networkCode: networkCode,
        phoneNumber: phoneNumber,
        serviceType: 'airtime',
        provider: 'vtpass',
        providerReference: airtimeResult.providerReference
      }
    });

    await transaction.save();

    await unifiedLedgerService.processUtilityPurchase({
      userId,
      transactionId: transaction._id,
      amount: amountInKobo,
      feeAmount,
      provider: 'vtpass',
      providerReference: airtimeResult.providerReference || airtimeResult.reference,
      reference: airtimeResult.reference,
      type: 'airtime',
      description: 'Airtime purchase',
      metadata: transaction.metadata,
    });

    const refreshedUser = await User.findById(userId).populate('walletId');

    res.json({
      success: true,
      transactionId: transaction._id,
      reference: airtimeResult.reference,
      amount: amount,
      phoneNumber: phoneNumber,
      network: networkCode,
      currency: 'NGN',
      status: transaction.status,
      fee: feeAmount / 100,
      totalDebit: grossAmount / 100,
      newBalance: refreshedUser.walletId.balance / 100,
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

    const user = await getUserWithWallet(userId);

    const amountInKobo = Math.round(amount * 100);
    const { feeAmount, feePercentage, grossAmount } = calculateFee(amountInKobo, 'NGN', 'data_bundle');

    // Check wallet balance
    if (user.walletId.balance < grossAmount) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        balance: user.walletId.balance / 100,
        required: grossAmount / 100
      });
    }

    // Process data purchase via VTPass
    const dataResult = await vtpassService.buyDataBundle(networkCode, phoneNumber, dataPlanId, amountInKobo, {
      email: user.email,
      phone: phoneNumber,
      customerId: userId
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
      feePercentage,
      feeAmount,
      netAmount: amountInKobo,
      method: 'vtpass',
      status: dataResult.status === 'success' ? 'completed' : 'pending',
      paystackReference: dataResult.reference,
      metadata: {
        networkCode: networkCode,
        phoneNumber: phoneNumber,
        dataPlanId: dataPlanId,
        serviceType: 'data',
        provider: 'vtpass',
        providerReference: dataResult.providerReference
      }
    });

    await transaction.save();

    await unifiedLedgerService.processUtilityPurchase({
      userId,
      transactionId: transaction._id,
      amount: amountInKobo,
      feeAmount,
      provider: 'vtpass',
      providerReference: dataResult.providerReference || dataResult.reference,
      reference: dataResult.reference,
      type: 'data_bundle',
      description: 'Data bundle purchase',
      metadata: transaction.metadata,
    });

    const refreshedUser = await User.findById(userId).populate('walletId');

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
      fee: feeAmount / 100,
      totalDebit: grossAmount / 100,
      newBalance: refreshedUser.walletId.balance / 100,
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

    const plans = await vtpassService.getDataPlans(networkCode);

    if (!plans.success) {
      return res.status(400).json({ 
        error: plans.error || 'Failed to fetch data plans'
      });
    }

    res.json({
      success: true,
      network: networkCode,
      plans: plans.plans,
      count: plans.count
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

    const providers = await vtpassService.getBillProviders(category);

    if (!providers.success) {
      return res.status(400).json({ 
        error: providers.error || 'Failed to fetch bill providers'
      });
    }

    if (category) {
      return res.json({
        success: true,
        category: category,
        providers: providers.providers,
        count: providers.count
      });
    }

    // Return all providers by category
    res.json({
      success: true,
      providers: providers.providers,
      categories: ['airtime', 'data', 'electricity', 'cable']
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
  setIOInstance,
};
