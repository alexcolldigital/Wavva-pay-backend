const express = require('express');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const logger = require('../utils/logger');
const router = express.Router();

// Import real-time notification helper
let emitTransactionUpdate;
try {
  emitTransactionUpdate = require('../controllers/transactionsController').emitTransactionUpdate;
} catch (err) {
  logger.warn('Transaction controller not available for real-time notifications');
  emitTransactionUpdate = () => {}; // No-op function
}

/**
 * Wema Bank Webhook Handler
 * Handles virtual account transfers and settlement events
 * Reference: https://playground.alat.ng/apis
 */

// Verify Wema webhook signature
function verifyWemaWebhook(req) {
  const signature = req.headers['x-wema-signature'] || req.headers['x-alat-signature'];
  if (!signature) {
    logger.warn('No webhook signature provided');
    return false;
  }

  const hash = crypto
    .createHmac('sha256', process.env.WEMA_SECRET_KEY || process.env.WEMA_API_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  const isValid = hash === signature;
  if (!isValid) {
    logger.warn('Invalid webhook signature', { expected: hash, received: signature });
  }

  return isValid;
}

// Handle Wema Webhook - Virtual Account Credit
router.post('/wema-account-credit', async (req, res) => {
  try {
    // Skip signature verification in development if credentials not set
    const skipVerification = !process.env.WEMA_SECRET_KEY && !process.env.WEMA_API_SECRET;

    if (!skipVerification && !verifyWemaWebhook(req)) {
      logger.warn('Invalid Wema webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook = req.body;

    logger.info(`Wema webhook received: ${webhook.event}`, {
      accountNumber: webhook.accountNumber || webhook.account_number,
      amount: webhook.amount,
      reference: webhook.reference
    });

    // Handle different event types
    if (webhook.event === 'account.credit' || webhook.event === 'CREDIT') {
      // Virtual account credited
      const accountNumber = webhook.accountNumber || webhook.account_number;
      const amount = webhook.amount;
      const reference = webhook.reference;
      const senderName = webhook.senderName || webhook.sender_name || 'Unknown Sender';
      const senderAccountNumber = webhook.senderAccountNumber || webhook.sender_account_number || 'Unknown';

      // Find user by virtual account number
      const user = await User.findOne({
        'virtualAccount.accountNumber': accountNumber
      });

      if (!user) {
        logger.warn(`User not found for virtual account: ${accountNumber}`);
        return res.json({ success: true }); // Accept webhook anyway
      }

      // Find or create transaction record
      let transaction = await Transaction.findOne({
        paystackReference: reference
      });

      if (!transaction) {
        // Create new transaction for incoming virtual account transfer
        const amountInCents = Math.round(amount * 100);
        transaction = new Transaction({
          sender: null, // External source
          receiver: user._id,
          amount: amountInCents,
          currency: 'NGN',
          type: 'virtual_account_credit',
          method: 'wema_virtual_account',
          status: 'completed',
          paystackReference: reference,
          description: `Incoming transfer from ${senderName} (${senderAccountNumber})`,
          metadata: {
            senderName,
            senderAccountNumber,
            senderBank: webhook.senderBank || webhook.sender_bank || 'Unknown',
            webhookData: webhook
          }
        });

        await transaction.save();

        // Emit real-time update
        emitTransactionUpdate(transaction, 'status_changed');
      } else {
        // Update existing transaction
        transaction.status = 'completed';
        transaction.metadata = { ...transaction.metadata, webhookData: webhook };
        await transaction.save();

        // Emit real-time update
        emitTransactionUpdate(transaction, 'status_changed');
      }

      // Credit user wallet
      const wallet = await Wallet.findById(user.walletId);
      if (wallet) {
        const amountInCents = Math.round(amount * 100);
        const currencyWallet = wallet.getOrCreateWallet('NGN');
        currencyWallet.balance += amountInCents;
        wallet.markModified('wallets');
        await wallet.save();

        logger.info(`✅ Virtual account credit: ${user._id} | Amount: ₦${amount} | New balance: ₦${currencyWallet.balance / 100}`);
      }
    } else if (webhook.event === 'account.debit' || webhook.event === 'DEBIT') {
      // Virtual account debited (outgoing transfer)
      const accountNumber = webhook.accountNumber || webhook.account_number;
      const amount = webhook.amount;
      const reference = webhook.reference;

      const transaction = await Transaction.findOne({
        paystackReference: reference
      });

      if (transaction) {
        transaction.status = 'completed';
        transaction.metadata = { ...transaction.metadata, webhookData: webhook };
        await transaction.save();

        // Emit real-time update
        emitTransactionUpdate(transaction, 'status_changed');

        logger.info(`Virtual account debit transaction ${transaction._id} marked as completed`);
      }
    }

    // Always return 200 to acknowledge webhook receipt
    res.json({ success: true });
  } catch (err) {
    logger.error('Wema webhook error:', err);
    // Still return 200 to prevent webhook retry
    res.status(200).json({ success: true, error: err.message });
  }
});

// Handle Wema Webhook - General Events
router.post('/wema-events', async (req, res) => {
  try {
    // Skip signature verification in development if credentials not set
    const skipVerification = !process.env.WEMA_SECRET_KEY && !process.env.WEMA_API_SECRET;

    if (!skipVerification && !verifyWemaWebhook(req)) {
      logger.warn('Invalid Wema webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook = req.body;

    logger.info(`Wema general webhook received: ${webhook.event}`, {
      data: webhook
    });

    // Process webhook using the service
    const virtualAccountService = require('../services/wema/virtualAccountService');

    if (webhook.event === 'account.credit' || webhook.event === 'CREDIT' ||
        webhook.event === 'account.debit' || webhook.event === 'DEBIT') {
      // Handle virtual account transactions
      const result = await virtualAccountService.handleVirtualAccountWebhook({
        accountNumber: webhook.accountNumber || webhook.account_number,
        amount: webhook.amount,
        transactionReference: webhook.reference,
        transactionType: webhook.event === 'account.credit' || webhook.event === 'CREDIT' ? 'CREDIT' : 'DEBIT',
        narration: webhook.narration || webhook.description || 'Virtual Account Transaction',
        senderName: webhook.senderName || webhook.sender_name,
        senderAccountNumber: webhook.senderAccountNumber || webhook.sender_account_number,
        senderBank: webhook.senderBank || webhook.sender_bank
      });

      if (result.success) {
        logger.info(`✅ Virtual account webhook processed: ${webhook.reference}`);
      } else {
        logger.warn(`❌ Virtual account webhook processing failed: ${result.message}`);
      }
    } else {
      logger.info(`Unhandled Wema webhook event: ${webhook.event}`);
    }

    // Always return 200 to acknowledge webhook receipt
    res.json({ success: true });
  } catch (err) {
    logger.error('Wema general webhook error:', err);
    // Still return 200 to prevent webhook retry
    res.status(200).json({ success: true, error: err.message });
  }
});

// Handle Wema Webhook - NIP Transfer Events
router.post('/wema-nip-transfer', async (req, res) => {
  try {
    // Skip signature verification in development if credentials not set
    const skipVerification = !process.env.WEMA_SECRET_KEY && !process.env.WEMA_API_SECRET;

    if (!skipVerification && !verifyWemaWebhook(req)) {
      logger.warn('Invalid Wema webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook = req.body;

    logger.info(`Wema NIP transfer webhook received: ${webhook.event}`, {
      transferId: webhook.transferId,
      status: webhook.status,
      reference: webhook.reference
    });

    // Handle NIP transfer status updates
    if (webhook.event === 'transfer.completed' || webhook.event === 'transfer.failed') {
      const transaction = await Transaction.findOne({
        paystackReference: webhook.reference
      });

      if (transaction) {
        transaction.status = webhook.event === 'transfer.completed' ? 'completed' : 'failed';
        if (webhook.event === 'transfer.failed') {
          transaction.failureReason = webhook.failureReason || 'Transfer failed';
        }
        transaction.metadata = { ...transaction.metadata, webhookData: webhook };
        await transaction.save();

        // Emit real-time update
        emitTransactionUpdate(transaction, 'status_changed');

        logger.info(`NIP transfer ${transaction._id} updated: ${transaction.status}`);
      }
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Wema NIP transfer webhook error:', err);
    res.status(200).json({ success: true, error: err.message });
  }
});

// Handle Wema Webhook - Settlement Events
router.post('/wema-settlement', async (req, res) => {
  try {
    // Skip signature verification in development if credentials not set
    const skipVerification = !process.env.WEMA_SECRET_KEY && !process.env.WEMA_API_SECRET;

    if (!skipVerification && !verifyWemaWebhook(req)) {
      logger.warn('Invalid Wema webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook = req.body;

    logger.info(`Wema settlement webhook: ${webhook.event}`, {
      settlementId: webhook.settlementId,
      amount: webhook.amount,
      status: webhook.status
    });

    // Handle settlement events
    if (webhook.event === 'settlement.completed') {
      logger.info(`✅ Settlement ${webhook.settlementId} completed successfully`);
      // Update Settlement model if needed
    } else if (webhook.event === 'settlement.failed') {
      logger.warn(`❌ Settlement ${webhook.settlementId} failed:`, webhook.failureReason);
      // Handle settlement failure
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Wema settlement webhook error:', err);
    res.status(200).json({ success: true, error: err.message });
  }
});

// Health check endpoint for webhooks
router.get('/wema-health', async (req, res) => {
  res.json({ status: 'active', service: 'wema-webhooks' });
});

module.exports = router;
