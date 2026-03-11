const express = require('express');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const logger = require('../utils/logger');
const router = express.Router();

/**
 * Wema Bank Webhook Handler
 * Handles virtual account transfers and settlement events
 * Reference: https://playground.alat.ng/apis
 */

// Verify Wema webhook signature
function verifyWemaWebhook(req) {
  const signature = req.headers['x-wema-signature'];
  if (!signature) return false;

  const hash = crypto
    .createHmac('sha256', process.env.WEMA_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  return hash === signature;
}

// Handle Wema Webhook - Virtual Account Credit
router.post('/wema-account-credit', async (req, res) => {
  try {
    // Verify webhook signature
    if (!verifyWemaWebhook(req)) {
      logger.warn('Invalid Wema webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook = req.body;

    logger.info(`Wema webhook received: ${webhook.event}`, {
      accountNumber: webhook.account_number,
      amount: webhook.amount,
      reference: webhook.reference
    });

    // Handle different event types
    if (webhook.event === 'account.credit') {
      // Virtual account credited
      const { accountNumber, amount, reference, senderName, senderAccountNumber } = webhook;

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
            senderBank: webhook.senderBank || 'Unknown'
          }
        });

        await transaction.save();
      } else {
        // Update existing transaction
        transaction.status = 'completed';
        await transaction.save();
      }

      // Credit user wallet
      const wallet = await Wallet.findById(user.walletId);
      if (wallet) {
        const amountInCents = Math.round(amount * 100);
        const currencyWallet = wallet.getOrCreateWallet('NGN');
        currencyWallet.balance += amountInCents;
        wallet.markModified('wallets');
        await wallet.save();

        logger.info(`✅ Virtual account credit: ${user._id} | Amount: ${amount} | New balance: ${currencyWallet.balance / 100}`);
      }
    } else if (webhook.event === 'account.debit') {
      // Virtual account debited (outgoing transfer)
      const { accountNumber, amount, reference } = webhook;

      const transaction = await Transaction.findOne({
        paystackReference: reference
      });

      if (transaction) {
        transaction.status = 'completed';
        await transaction.save();
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

// Handle Wema Webhook - Transfer Status Update
router.post('/wema-transfer-status', async (req, res) => {
  try {
    if (!verifyWemaWebhook(req)) {
      logger.warn('Invalid Wema webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook = req.body;

    logger.info(`Wema transfer webhook: ${webhook.status}`, {
      transferId: webhook.transferId,
      reference: webhook.reference
    });

    // Find transaction by transfer ID
    const transaction = await Transaction.findOne({
      paystackTransactionId: webhook.transferId
    });

    if (transaction) {
      transaction.status = webhook.status === 'successful' ? 'completed' : 'failed';
      if (webhook.status === 'failed') {
        transaction.failureReason = webhook.failureReason || 'Transfer failed';
      }
      await transaction.save();

      logger.info(`Transfer ${transaction._id} updated: ${transaction.status}`);

      // If transfer failed, refund the wallet
      if (webhook.status === 'failed' && transaction.type === 'payout') {
        const wallet = await Wallet.findById(transaction.sender);
        if (wallet) {
          const totalDebit = transaction.amount + transaction.feeAmount;
          wallet.balance += totalDebit;
          await wallet.save();
          logger.info(`Refunded ${totalDebit / 100} to wallet due to failed transfer`);
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Wema transfer webhook error:', err);
    res.status(200).json({ success: true, error: err.message });
  }
});

// Handle Wema Webhook - Settlement Update
router.post('/wema-settlement', async (req, res) => {
  try {
    if (!verifyWemaWebhook(req)) {
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
