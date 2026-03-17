const express = require('express');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const MerchantTransaction = require('../models/MerchantTransaction');
const MerchantWallet = require('../models/MerchantWallet');
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
 * Flutterwave Webhook Handler
 * Handles payment status updates from Flutterwave
 * Reference: https://developer.flutterwave.com/docs/webhooks/
 */

// Verify Flutterwave webhook signature
function verifyFlutterwaveWebhook(req) {
  const hash = crypto
    .createHmac('sha256', process.env.FLUTTERWAVE_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('base64');
  
  return hash === req.headers['verificationhash'];
}

// Handle payment webhook from Flutterwave
router.post('/flutterwave-payment', async (req, res) => {
  try {
    // Verify webhook signature
    if (!verifyFlutterwaveWebhook(req)) {
      logger.warn('Invalid Flutterwave webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    const data = event.data;

    logger.info(`Flutterwave webhook received: ${event.event}`, {
      transactionId: data.id,
      reference: data.tx_ref,
      status: data.status
    });

    // Handle different event types
    if (event.event === 'charge.completed') {
      // Payment successful
      const transaction = await Transaction.findOne({
        paystackReference: data.tx_ref
      });

      if (!transaction) {
        logger.warn(`Transaction not found for reference: ${data.tx_ref}`);
        return res.json({ success: true }); // Accept the webhook anyway
      }

      if (data.status === 'successful') {
        // Update transaction status
        transaction.status = 'completed';
        transaction.paystackTransactionId = data.id;
        transaction.metadata = { ...transaction.metadata, webhookData: data };
        await transaction.save();

        // Emit real-time update
        emitTransactionUpdate(transaction, 'status_changed');

        // Update wallet balance based on transaction type
        if (transaction.type === 'wallet_funding') {
          const wallet = await Wallet.findById(transaction.sender);
          if (wallet && wallet.balance < transaction.amount) {
            // Credit the wallet if not already done
            wallet.balance += transaction.amount;
            await wallet.save();
          }
        } else if (transaction.type === 'merchant_payment') {
          // Credit merchant wallet
          const merchantWallet = await MerchantWallet.findOne({
            merchantId: transaction.receiver
          });
          if (merchantWallet) {
            merchantWallet.balance += transaction.netAmount;
            await merchantWallet.save();
          }
        }

        logger.info(`✅ Transaction ${transaction._id} marked as completed`);
      } else if (data.status === 'failed') {
        // Payment failed
        transaction.status = 'failed';
        transaction.failureReason = data.processor_response || 'Payment failed';
        transaction.metadata = { ...transaction.metadata, webhookData: data };
        await transaction.save();

        // Refund wallet if wallet funding failed
        if (transaction.type === 'wallet_funding') {
          const wallet = await Wallet.findById(transaction.sender);
          if (wallet) {
            wallet.balance -= transaction.amount;
            await wallet.save();
          }
        }

        logger.warn(`❌ Transaction ${transaction._id} failed:`, data.processor_response);
      }
    } else if (event.event === 'transfer.completed') {
      // Bank transfer completed
      const transaction = await Transaction.findOne({
        paystackTransactionId: data.id
      });

      if (transaction) {
        transaction.status = data.status === 'successful' ? 'completed' : 'failed';
        transaction.metadata = { ...transaction.metadata, webhookData: data };
        await transaction.save();

        // Emit real-time update
        emitTransactionUpdate(transaction, 'status_changed');

        logger.info(`Bank transfer ${transaction._id} updated: ${transaction.status}`);
      }
    } else if (event.event === 'bill.created' || event.event === 'bill.completed') {
      // Bill payment events
      const transaction = await Transaction.findOne({
        paystackReference: data.tx_ref
      });

      if (transaction) {
        if (event.event === 'bill.completed' && data.status === 'successful') {
          transaction.status = 'completed';
        } else if (data.status === 'failed') {
          transaction.status = 'failed';
          transaction.failureReason = data.failure_reason || 'Bill payment failed';
        }
        transaction.metadata = { ...transaction.metadata, webhookData: data };
        await transaction.save();

        // Emit real-time update
        emitTransactionUpdate(transaction, 'status_changed');

        logger.info(`Bill payment ${transaction._id} updated: ${transaction.status}`);
      }
    } else if (event.event === 'subscription.created' || event.event === 'subscription.cancelled') {
      // Subscription events
      logger.info(`Subscription ${event.event}: ${data.id}`);
      // Handle subscription events as needed
    }

    // Always return 200 to acknowledge webhook receipt
    res.json({ success: true });
  } catch (err) {
    logger.error('Flutterwave webhook error:', err);
    // Still return 200 to prevent webhook retry
    res.status(200).json({ success: true, error: err.message });
  }
});

// Handle Flutterwave general webhook events
router.post('/flutterwave-events', async (req, res) => {
  try {
    // Skip signature verification in development if secret not set
    const skipVerification = !process.env.FLUTTERWAVE_SECRET_KEY;

    if (!skipVerification && !verifyFlutterwaveWebhook(req)) {
      logger.warn('Invalid Flutterwave webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    const data = event.data;

    logger.info(`Flutterwave general webhook received: ${event.event}`, {
      transactionId: data?.id,
      reference: data?.tx_ref,
      status: data?.status
    });

    // Use the enhanced webhook processor from the service
    const flutterwaveService = require('../services/flutterwave');
    const result = await flutterwaveService.processWebhookEvent(event);

    if (result.success) {
      logger.info(`✅ Flutterwave webhook processed: ${event.event}`);
    } else {
      logger.warn(`❌ Flutterwave webhook processing failed: ${result.error}`);
    }

    // Always return 200 to acknowledge webhook receipt
    res.json({ success: true });
  } catch (err) {
    logger.error('Flutterwave general webhook error:', err);
    // Still return 200 to prevent webhook retry
    res.status(200).json({ success: true, error: err.message });
  }
});

// Health check endpoint for webhooks
router.get('/flutterwave-health', async (req, res) => {
  res.json({ status: 'active', service: 'flutterwave-webhooks' });
});

module.exports = router;
