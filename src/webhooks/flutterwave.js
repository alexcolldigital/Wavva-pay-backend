const express = require('express');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const MerchantTransaction = require('../models/MerchantTransaction');
const MerchantWallet = require('../models/MerchantWallet');
const logger = require('../utils/logger');
const router = express.Router();

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
        await transaction.save();

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
        await transaction.save();
        logger.info(`Bank transfer ${transaction._id} updated: ${transaction.status}`);
      }
    }

    // Always return 200 to acknowledge webhook receipt
    res.json({ success: true });
  } catch (err) {
    logger.error('Flutterwave webhook error:', err);
    // Still return 200 to prevent webhook retry
    res.status(200).json({ success: true, error: err.message });
  }
});

// Health check endpoint for webhooks
router.get('/flutterwave-health', async (req, res) => {
  res.json({ status: 'active', service: 'flutterwave-webhooks' });
});

module.exports = router;
