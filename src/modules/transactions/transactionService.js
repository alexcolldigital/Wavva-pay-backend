const mongoose = require('mongoose');
const WalletService = require('../wallet/walletService');
const CommissionService = require('../commission/commissionService');
const { calculateFee } = require('../../utils/feeCalculator');
const { recordCommission } = require('../../services/commissionService');
const Ledger = require('../../models/Ledger');

class TransactionService {
  // Process a complete transaction with all wallet movements
  static async processTransaction(transactionData) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        type,
        amount,
        currency = 'NGN',
        senderId,
        receiverId,
        merchantId,
        provider = 'internal',
        providerReference,
        description,
        metadata = {}
      } = transactionData;

      // Create transaction record
      const Transaction = mongoose.model('Transaction');
      const transaction = new Transaction({
        sender: senderId,
        receiver: receiverId,
        amount,
        currency,
        type,
        description,
        method: provider,
        metadata: { ...metadata, providerReference },
        status: 'pending'
      });

      await transaction.save({ session });

      // Calculate fees and commission
      const commissionResult = await CommissionService.processCommission({
        transactionType: type,
        amount,
        currency,
        userId: senderId,
        merchantId,
        transactionId: transaction._id,
        reference: providerReference || `TXN-${transaction._id}`,
        provider,
        dailyTransferCount: metadata.dailyTransferCount || 0
      });

      // Process main transaction based on type
      let result;
      switch (type) {
        case 'transfer':
          result = await this.processTransfer(transaction, session);
          break;
        case 'funding':
          result = await this.processFunding(transaction, session);
          break;
        case 'merchant_payment':
          result = await this.processMerchantPayment(transaction, session);
          break;
        case 'bill_payment':
        case 'airtime':
        case 'data':
        case 'cable':
        case 'electricity':
          result = await this.processBillPayment(transaction, session);
          break;
        default:
          throw new Error(`Unsupported transaction type: ${type}`);
      }

      // Update transaction status
      transaction.status = 'completed';
      transaction.feeAmount = commissionResult.fee;
      transaction.netAmount = amount - commissionResult.fee;
      await transaction.save({ session });

      await session.commitTransaction();

      return {
        transaction,
        commission: commissionResult,
        result,
        ledgerEntries: [...commissionResult.ledgerEntries, ...(result.ledgerEntries || [])]
      };

    } catch (error) {
      await session.abortTransaction();
      throw new Error(`Transaction processing failed: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  // Process peer-to-peer transfer
  static async processTransfer(transaction, session) {
    const senderWallet = await WalletService.getUserWallet(transaction.sender, transaction.currency);
    const receiverWallet = await WalletService.getUserWallet(transaction.receiver, transaction.currency);

    if (!senderWallet || !receiverWallet) {
      throw new Error('Wallet not found');
    }

    // Transfer from sender to receiver
    const transferResult = await WalletService.transfer(
      senderWallet.walletId,
      receiverWallet.walletId,
      transaction.netAmount || transaction.amount,
      {
        transactionId: transaction._id,
        reference: `TRANSFER-${transaction._id}`,
        type: 'transfer',
        provider: transaction.method,
        userId: transaction.sender,
        description: transaction.description,
        metadata: transaction.metadata
      }
    );

    return {
      senderWallet: transferResult.fromWallet,
      receiverWallet: transferResult.toWallet,
      ledgerEntries: [transferResult.ledgerEntry]
    };
  }

  // Process wallet funding
  static async processFunding(transaction, session) {
    const settlementWallet = await WalletService.getSettlementWallet(transaction.currency);
    const userWallet = await WalletService.getUserWallet(transaction.sender, transaction.currency);

    if (!settlementWallet || !userWallet) {
      throw new Error('Wallet not found');
    }

    // Move from settlement to user wallet
    const transferResult = await WalletService.transfer(
      settlementWallet.walletId,
      userWallet.walletId,
      transaction.netAmount || transaction.amount,
      {
        transactionId: transaction._id,
        reference: `FUNDING-${transaction._id}`,
        type: 'funding',
        provider: transaction.method,
        userId: transaction.sender,
        description: transaction.description,
        metadata: transaction.metadata
      }
    );

    return {
      settlementWallet: transferResult.fromWallet,
      userWallet: transferResult.toWallet,
      ledgerEntries: [transferResult.ledgerEntry]
    };
  }

  // Process merchant payment
  static async processMerchantPayment(transaction, session) {
    const userWallet = await WalletService.getUserWallet(transaction.sender, transaction.currency);
    const settlementWallet = await WalletService.getSettlementWallet(transaction.currency);

    if (!userWallet || !settlementWallet) {
      throw new Error('Wallet not found');
    }

    // Move from user to settlement (will be settled to merchant later)
    const transferResult = await WalletService.transfer(
      userWallet.walletId,
      settlementWallet.walletId,
      transaction.netAmount || transaction.amount,
      {
        transactionId: transaction._id,
        reference: `MERCHANT-${transaction._id}`,
        type: 'merchant_payment',
        provider: transaction.method,
        userId: transaction.sender,
        merchantId: transaction.metadata.merchantId,
        description: transaction.description,
        metadata: transaction.metadata
      }
    );

    return {
      userWallet: transferResult.fromWallet,
      settlementWallet: transferResult.toWallet,
      ledgerEntries: [transferResult.ledgerEntry]
    };
  }

  // Process bill payment
  static async processBillPayment(transaction, session) {
    const userWallet = await WalletService.getUserWallet(transaction.sender, transaction.currency);
    const settlementWallet = await WalletService.getSettlementWallet(transaction.currency);

    if (!userWallet || !settlementWallet) {
      throw new Error('Wallet not found');
    }

    // Move from user to settlement (will be paid to bill provider)
    const transferResult = await WalletService.transfer(
      userWallet.walletId,
      settlementWallet.walletId,
      transaction.netAmount || transaction.amount,
      {
        transactionId: transaction._id,
        reference: `BILL-${transaction._id}`,
        type: transaction.type,
        provider: transaction.method,
        userId: transaction.sender,
        description: transaction.description,
        metadata: transaction.metadata
      }
    );

    return {
      userWallet: transferResult.fromWallet,
      settlementWallet: transferResult.toWallet,
      ledgerEntries: [transferResult.ledgerEntry]
    };
  }

  // Process webhook settlement
  static async processWebhookSettlement(webhookData) {
    try {
      const {
        reference,
        amount,
        currency = 'NGN',
        provider,
        providerReference,
        status
      } = webhookData;

      console.log('💰 Processing webhook settlement:', {
        reference,
        amount,
        currency,
        provider,
        providerReference,
        status
      });

      if (status !== 'successful') {
        console.warn('⚠️ Settlement skipped - status not successful:', status);
        return { success: false, message: 'Transaction not successful' };
      }

      // Find existing transaction (simple approach without sessions to avoid visibility issues)
      const Transaction = mongoose.model('Transaction');
      
      console.log('🔍 Settlement lookup - searching for reference:', reference);
      
      // DEBUG: Check what transactions exist in database
      const allWalletFundingTxns = await Transaction.find({ 
        type: 'wallet_funding' 
      }).select('_id flutterwaveReference metadata.providerReference status createdAt').limit(5);
      console.log('📊 Available wallet_funding transactions (last 5):', allWalletFundingTxns.map(t => ({
        id: t._id,
        flutterwaveRef: t.flutterwaveReference,
        providerRef: t.metadata?.providerReference,
        status: t.status,
        created: t.createdAt
      })));

      // PRIMARY: Search by tx_ref (most reliable - created when transaction initialized)
      console.log('🔎 PRIMARY LOOKUP - Finding by flutterwaveReference:', reference);
      let transaction = await Transaction.findOne({
        flutterwaveReference: reference
      });
      console.log('Result of PRIMARY lookup:', transaction ? `Found ${transaction._id}` : 'NOT FOUND');

      if (transaction) {
        console.log('✅ Found by flutterwaveReference (tx_ref)');
      } else {
        console.log('⚠️ Not found by flutterwaveReference, trying metadata fields...');
        
        // SECONDARY: Try metadata fields
        console.log('🔎 SECONDARY LOOKUP - Finding by metadata', {
          providerReference: providerReference,
          reference: reference
        });
        transaction = await Transaction.findOne({
          $or: [
            { 'metadata.providerReference': reference },
            { 'metadata.providerReference': providerReference },
            { 'metadata.reference': reference },
            { 'metadata.txRef': reference }
          ]
        });
        console.log('Result of SECONDARY lookup:', transaction ? `Found ${transaction._id}` : 'NOT FOUND');
        
        if (transaction) {
          console.log('✅ Found by metadata field');
        } else {
          console.log('⚠️ Not found by metadata, trying substring search...');
          
          // TERTIARY: Try substring matching
          console.log('🔎 TERTIARY LOOKUP - Finding by regex/substring');
          transaction = await Transaction.findOne({
            $or: [
              { flutterwaveReference: { $regex: reference, $options: 'i' } },
              { 'metadata.reference': { $regex: reference, $options: 'i' } },
              { 'metadata.providerReference': { $regex: reference, $options: 'i' } }
            ]
          });
          console.log('Result of TERTIARY lookup:', transaction ? `Found ${transaction._id}` : 'NOT FOUND');
          
          if (transaction) {
            console.log('✅ Found by substring search');
          }
        }
      }

      if (!transaction) {
        console.error('❌ Transaction not found:', { reference, providerReference });
        throw new Error(`Transaction not found - Reference: ${reference}`);
      }

      console.log('📋 Found transaction for settlement:', {
        id: transaction._id,
        type: transaction.type,
        status: transaction.status,
        sender: transaction.sender,
        flutterwaveRef: transaction.flutterwaveReference,
        metadataProviderRef: transaction.metadata?.providerReference
      });

      if (transaction.status === 'completed') {
        console.log('✅ Transaction already completed:', transaction._id);
        return { success: true, message: 'Transaction already processed' };
      }

      // Wallet funding specific: move amount to user wallet and collect fee
      if (transaction.type === 'wallet_funding') {
        console.log('💳 Processing wallet funding...');
        console.log('� DEBUG - Settlement input:');
        console.log('   amount:', amount);
        console.log('   amount type:', typeof amount);
        console.log('   currency:', currency);
        console.log('   transaction.amount (from DB):', transaction.amount);
        console.log('   transaction.amount / 100:', transaction.amount / 100);
        
        const feeData = calculateFee(amount, currency, 'wallet_funding');
        console.log('📊 Fee calculation result:');
        console.log('   - feePercentage:', feeData.feePercentage + '%');
        console.log('   - feeAmount (Kobo):', feeData.feeAmount, '=', '₦', (feeData.feeAmount / 100).toFixed(2));
        console.log('   - netAmount (Kobo):', feeData.netAmount, '=', '₦', (feeData.netAmount / 100).toFixed(2));
        console.log('   - grossAmount (Kobo):', feeData.grossAmount, '=', '₦', (feeData.grossAmount / 100).toFixed(2));

        try {
          // Try to get user wallet from WalletV2 (new system)
          const userWallet = await WalletService.getUserWallet(transaction.sender, currency);
          
          console.log('🔍 Wallet Lookup: Searching for WalletV2...');
          console.log('   Result:', userWallet ? `Found WalletV2 (${userWallet.walletId})` : 'WalletV2 NOT FOUND');
          
          if (!userWallet) {
            console.log('📝 Using DIRECT WALLET UPDATE Path (old Wallet model)...');
            
            // Fallback: directly update the user's wallet in the old Wallet model
            const User = mongoose.model('User');
            const Wallet = mongoose.model('Wallet');
            
            const user = await User.findById(transaction.sender);
            if (!user) {
              throw new Error('User not found for wallet funding');
            }

            let userWalletDoc = await Wallet.findOne({ userId: transaction.sender });
            if (!userWalletDoc) {
              console.log('📝 Creating new wallet for user:', transaction.sender);
              userWalletDoc = new Wallet({
                userId: transaction.sender,
                balance: 0,
                multicurrencyBalances: [{ currency, balance: 0 }]
              });
            }

            // Update balance directly in BOTH places (root and nested wallets array)
            console.log('💾 Updating wallet balance...');
            console.log('   Before update:');
            console.log('     - Root balance (cents):', userWalletDoc.balance, '(₦', userWalletDoc.balance / 100 + ')');
            console.log('     - Nested balance (cents):', userWalletDoc.wallets[0]?.balance, '(₦', userWalletDoc.wallets[0]?.balance / 100 + ')');
            console.log('   Adding to balance (cents):', feeData.netAmount, '(₦', feeData.netAmount / 100 + ')');
            
            // Update root balance (legacy)
            userWalletDoc.balance += feeData.netAmount;
            
            // IMPORTANT: Also update the nested wallets array (what API returns)
            const ngnWallet = userWalletDoc.wallets.find(w => w.currency === currency);
            if (ngnWallet) {
              ngnWallet.balance += feeData.netAmount;
              console.log('   Updated NGN wallet balance: +', feeData.netAmount, '= total', ngnWallet.balance, 'cents (₦', ngnWallet.balance / 100 + ')');
            } else {
              // Create NGN wallet if it doesn't exist
              userWalletDoc.wallets.push({
                currency: 'NGN',
                purpose: 'general',
                name: 'NGN Wallet',
                balance: feeData.netAmount,
                dailyLimit: 10000 * 100,
                monthlyLimit: 100000 * 100,
                dailySpent: 0,
                monthlySpent: 0,
                isActive: true,
                createdAt: new Date()
              });
              console.log('   Created new NGN wallet with balance:', feeData.netAmount, 'cents (₦', feeData.netAmount / 100 + ')');
            }
            
            // Mark wallets as modified for Mongoose to track changes
            userWalletDoc.markModified('wallets');
            
            // Update multicurrency balance (legacy support)
            const currencyIndex = userWalletDoc.multicurrencyBalances.findIndex(b => b.currency === currency);
            if (currencyIndex >= 0) {
              userWalletDoc.multicurrencyBalances[currencyIndex].balance += feeData.netAmount;
            } else {
              userWalletDoc.multicurrencyBalances.push({ currency, balance: feeData.netAmount });
            }
            
            try {
              await userWalletDoc.save();
              console.log('   After update:');
              console.log('     - Root balance (cents):', userWalletDoc.balance, '(₦', userWalletDoc.balance / 100 + ')');
              console.log('     - Nested balance (cents):', userWalletDoc.wallets.find(w => w.currency === currency)?.balance, '(₦', (userWalletDoc.wallets.find(w => w.currency === currency)?.balance / 100) + ')');
              console.log('✅ Wallet saved successfully');
            } catch (saveErr) {
              // Handle version conflict - reload and retry once
              if (saveErr.name === 'VersionError') {
                console.warn('⚠️ Version conflict on wallet save, reloading and retrying...');
                const Wallet = mongoose.model('Wallet');
                const refreshedWallet = await Wallet.findById(transaction.sender);
                
                if (refreshedWallet) {
                  refreshedWallet.balance += feeData.netAmount;
                  const ngnWallet = refreshedWallet.wallets.find(w => w.currency === currency);
                  if (ngnWallet) {
                    ngnWallet.balance += feeData.netAmount;
                  }
                  refreshedWallet.markModified('wallets');
                  await refreshedWallet.save();
                  console.log('✅ Wallet saved successfully (after retry)');
                }
              } else {
                throw saveErr;
              }
            }
          } else {
            // Use WalletService transfer for WalletV2
            console.log('� Using WALLETSERVICE Path (WalletV2 model)...');
            console.log('   userWallet.walletId:', userWallet.walletId);
            
            console.log('�🔄 Attempting settlement wallet transfer via WalletService...');
            
            // Get settlement wallet
            const settlementWallet = await WalletService.getSettlementWallet(currency);
            if (!settlementWallet) {
              throw new Error('Settlement wallet not found');
            }

            console.log('📦 Settlement wallet:', settlementWallet.walletId);

            // Credit settlement wallet with full amount
            console.log('💰 Crediting settlement wallet...');
            await WalletService.creditWallet(
              settlementWallet.walletId,
              amount,
              {
                transactionId: transaction._id,
                reference: `WEBHOOK-${providerReference}`,
                type: 'settlement',
                provider,
                userId: transaction.sender,
                description: `Settlement from ${provider}`,
                metadata: webhookData
              }
            );

            // Transfer net amount from settlement to user wallet
            console.log('🔁 Transferring net amount to user wallet...');
            await WalletService.transfer(
              settlementWallet.walletId,
              userWallet.walletId,
              feeData.netAmount,
              {
                transactionId: transaction._id,
                reference: `FUNDING-${transaction._id}`,
                type: 'wallet_funding',
                provider,
                userId: transaction.sender,
                description: 'Wallet funding through webhook settlement',
                metadata: webhookData
              }
            );

            console.log('✅ Wallet transfer completed via WalletService');
          }

          // Record commission in commission ledger
          if (feeData.feeAmount > 0) {
            console.log('📝 Recording commission:', feeData.feeAmount);
            await recordCommission({
              transactionId: transaction._id,
              amount: feeData.feeAmount,
              currency,
              source: 'wallet_funding',
              fromUser: transaction.sender,
              toUser: null,
              feePercentage: feeData.feePercentage,
              grossAmount: amount,
              description: 'Wallet funding fee from webhook settlement'
            });
          }

          transaction.feeAmount = feeData.feeAmount;
          transaction.netAmount = feeData.netAmount;
          transaction.feePercentage = feeData.feePercentage;

        } catch (fundingErr) {
          console.error('❌ Wallet funding error:', fundingErr.message);
          console.error('   Stack:', fundingErr.stack);
          
          // Even if transfer fails, mark transaction as completed since payment went through
          console.log('⚠️ Marking transaction as completed despite settlement error');
          console.log('   User may need manual balance update');
          
          // Try direct balance update as last resort ONLY if it's a version error
          // (primary update already succeeded but version conflict on save)
          if (fundingErr.name === 'VersionError') {
            try {
              const Wallet = mongoose.model('Wallet');
              const userWalletDoc = await Wallet.findOne({ userId: transaction.sender });
              
              if (userWalletDoc) {
                const ngnWallet = userWalletDoc.wallets.find(w => w.currency === currency);
                const currentNgnBalance = ngnWallet?.balance || 0;
                const expectedBalanceAfterFunding = feeData.netAmount;
                
                // Only apply fallback if the amount hasn't been added yet
                if (currentNgnBalance < expectedBalanceAfterFunding) {
                  console.log('📊 Fallback: Balance not yet updated, applying now...');
                  console.log('   Current balance:', currentNgnBalance, 'Expected:', expectedBalanceAfterFunding);
                  
                  const amountToAdd = feeData.netAmount - currentNgnBalance;
                  userWalletDoc.balance = (userWalletDoc.balance || 0) + amountToAdd;
                  
                  if (ngnWallet) {
                    ngnWallet.balance = expectedBalanceAfterFunding;
                  } else {
                    userWalletDoc.wallets.push({
                      currency: 'NGN',
                      purpose: 'general',
                      name: 'NGN Wallet',
                      balance: expectedBalanceAfterFunding,
                      dailyLimit: 10000 * 100,
                      monthlyLimit: 100000 * 100,
                      dailySpent: 0,
                      monthlySpent: 0,
                      isActive: true,
                      createdAt: new Date()
                    });
                  }
                  
                  userWalletDoc.markModified('wallets');
                  await userWalletDoc.save();
                  console.log('✅ Fallback balance update succeeded - balance now:', ngnWallet?.balance || expectedBalanceAfterFunding);
                } else {
                  console.log('✅ Balance already updated in primary attempt, skipping fallback');
                }
              }
            } catch (fallbackErr) {
              console.error('🔴 Fallback balance update also failed:', fallbackErr.message);
            }
          }
        }
      }

      // Update transaction status
      transaction.status = 'completed';
      transaction.metadata = {
        ...transaction.metadata,
        webhookProcessed: true,
        webhookData,
        settledAt: new Date()
      };
      await transaction.save();

      console.log('✅ Transaction marked as completed');

      return {
        success: true,
        transaction,
        settled: true,
        message: 'Webhook settlement processed successfully'
      };

    } catch (error) {
      throw new Error(`Webhook settlement failed: ${error.message}`);
    } finally {
    }
  }

  // Reverse transaction
  static async reverseTransaction(transactionId, reason, reversedBy) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const Transaction = mongoose.model('Transaction');
      const transaction = await Transaction.findById(transactionId).session(session);

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status === 'reversed') {
        throw new Error('Transaction already reversed');
      }

      // Reverse ledger entries
      const ledgerEntries = await Ledger.find({
        transactionId: transaction._id,
        status: 'completed'
      }).session(session);

      for (const entry of ledgerEntries) {
        await Ledger.reverseEntry(entry.ledgerId, reason, reversedBy);
      }

      // Update transaction status
      transaction.status = 'reversed';
      transaction.metadata.reversalReason = reason;
      transaction.metadata.reversedBy = reversedBy;
      transaction.metadata.reversedAt = new Date();
      await transaction.save({ session });

      await session.commitTransaction();

      return {
        transaction,
        reversedEntries: ledgerEntries.length,
        reason
      };

    } catch (error) {
      await session.abortTransaction();
      throw new Error(`Transaction reversal failed: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  // Get transaction details with ledger
  static async getTransactionDetails(transactionId) {
    try {
      const Transaction = mongoose.model('Transaction');
      const transaction = await Transaction.findById(transactionId)
        .populate('sender', 'firstName lastName email')
        .populate('receiver', 'firstName lastName email');

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      const ledgerEntries = await Ledger.find({ transactionId })
        .populate('fromWallet', 'type name walletId')
        .populate('toWallet', 'type name walletId')
        .sort({ createdAt: 1 });

      return {
        transaction,
        ledgerEntries
      };

    } catch (error) {
      throw new Error(`Failed to get transaction details: ${error.message}`);
    }
  }

  // Get transaction statistics
  static async getTransactionStats(filters = {}) {
    try {
      const matchQuery = {};

      if (filters.status) matchQuery.status = filters.status;
      if (filters.type) matchQuery.type = filters.type;
      if (filters.currency) matchQuery.currency = filters.currency;
      if (filters.dateRange) {
        matchQuery.createdAt = {
          $gte: new Date(filters.dateRange.start),
          $lte: new Date(filters.dateRange.end)
        };
      }

      const stats = await mongoose.model('Transaction').aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              type: '$type',
              status: '$status',
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            totalFees: { $sum: '$feeAmount' }
          }
        },
        {
          $group: {
            _id: '$_id.date',
            transactions: {
              $push: {
                type: '$_id.type',
                status: '$_id.status',
                count: '$count',
                amount: '$totalAmount',
                fees: '$totalFees'
              }
            },
            totalTransactions: { $sum: '$count' },
            totalVolume: { $sum: '$totalAmount' },
            totalFees: { $sum: '$totalFees' }
          }
        },
        { $sort: { '_id': -1 } }
      ]);

      return stats;
    } catch (error) {
      throw new Error(`Failed to get transaction stats: ${error.message}`);
    }
  }
}

module.exports = TransactionService;