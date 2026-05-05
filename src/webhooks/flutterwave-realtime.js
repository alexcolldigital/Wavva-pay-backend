const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const crypto = require('crypto');

const FLUTTERWAVE_WEBHOOK_SECRET = process.env.FLUTTERWAVE_WEBHOOK_SECRET;

// Verify Flutterwave webhook signature
function verifyFlutterwaveSignature(req) {
  if (!FLUTTERWAVE_WEBHOOK_SECRET) {
    logger.warn('FLUTTERWAVE_WEBHOOK_SECRET not configured');
    return true;
  }

  const signature = req.headers['verificationhash'];
  const body = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', FLUTTERWAVE_WEBHOOK_SECRET).update(body).digest('hex');

  return signature === hash;
}

// ============================================
// Payment Webhook
// ============================================

router.post('/flutterwave/payment', (req, res) => {
  try {
    if (!verifyFlutterwaveSignature(req)) {
      logger.warn('Invalid Flutterwave webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    const io = req.io;

    logger.info(`Flutterwave payment webhook: ${event}`, {
      reference: data?.tx_ref,
      status: data?.status
    });

    if (event === 'charge.completed') {
      const { id, tx_ref, amount, currency, status, customer, meta } = data;

      if (status === 'successful') {
        const userId = meta?.userId || customer?.email;

        io.to(`user:${userId}`).emit('payment:success', {
          transactionId: id,
          reference: tx_ref,
          amount,
          currency,
          status,
          timestamp: new Date()
        });

        io.to('admin').emit('transaction:completed', {
          type: 'card_payment',
          transactionId: id,
          reference: tx_ref,
          amount,
          customer: customer?.email,
          timestamp: new Date()
        });

        logger.info(`✅ Payment successful: ${tx_ref}`);
      } else if (status === 'failed') {
        const userId = meta?.userId || customer?.email;

        io.to(`user:${userId}`).emit('payment:failed', {
          transactionId: id,
          reference: tx_ref,
          reason: data.processor_response || 'Payment failed',
          timestamp: new Date()
        });

        logger.error(`❌ Payment failed: ${tx_ref}`);
      }
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Flutterwave payment webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Transfer Webhook
// ============================================

router.post('/flutterwave/transfer', (req, res) => {
  try {
    if (!verifyFlutterwaveSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    const io = req.io;

    logger.info(`Flutterwave transfer webhook: ${event}`, {
      reference: data?.reference,
      status: data?.status
    });

    if (event === 'transfer.completed') {
      const { id, reference, amount, status, meta } = data;

      const userId = meta?.userId;

      io.to(`user:${userId}`).emit('transfer:completed', {
        transferId: id,
        reference,
        amount,
        status,
        timestamp: new Date()
      });

      io.to('admin').emit('transaction:completed', {
        type: 'transfer',
        transferId: id,
        reference,
        amount,
        timestamp: new Date()
      });

      logger.info(`✅ Transfer completed: ${reference}`);
    } else if (event === 'transfer.failed') {
      const { id, reference, meta, reason } = data;

      const userId = meta?.userId;

      io.to(`user:${userId}`).emit('transfer:failed', {
        transferId: id,
        reference,
        reason: reason || 'Transfer failed',
        timestamp: new Date()
      });

      logger.error(`❌ Transfer failed: ${reference}`);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Flutterwave transfer webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Bill Payment Webhook
// ============================================

router.post('/flutterwave/bill', (req, res) => {
  try {
    if (!verifyFlutterwaveSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    const io = req.io;

    logger.info(`Flutterwave bill webhook: ${event}`, {
      reference: data?.reference,
      status: data?.status
    });

    if (event === 'bill.completed') {
      const { id, reference, amount, status, meta, type } = data;

      const userId = meta?.userId;
      const billType = type?.split('_')[0]?.toLowerCase() || 'bill';

      io.to(`user:${userId}`).emit(`${billType}:completed`, {
        billId: id,
        reference,
        amount,
        status,
        type,
        timestamp: new Date()
      });

      io.to('admin').emit('transaction:completed', {
        type: billType,
        billId: id,
        reference,
        amount,
        timestamp: new Date()
      });

      logger.info(`✅ Bill payment completed: ${reference}`);
    } else if (event === 'bill.failed') {
      const { id, reference, meta, reason, type } = data;

      const userId = meta?.userId;
      const billType = type?.split('_')[0]?.toLowerCase() || 'bill';

      io.to(`user:${userId}`).emit(`${billType}:failed`, {
        billId: id,
        reference,
        reason: reason || 'Bill payment failed',
        type,
        timestamp: new Date()
      });

      logger.error(`❌ Bill payment failed: ${reference}`);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Flutterwave bill webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Refund Webhook
// ============================================

router.post('/flutterwave/refund', (req, res) => {
  try {
    if (!verifyFlutterwaveSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    const io = req.io;

    logger.info(`Flutterwave refund webhook: ${event}`, {
      reference: data?.reference,
      status: data?.status
    });

    if (event === 'refund.completed') {
      const { id, reference, amount, meta } = data;

      const userId = meta?.userId;

      io.to(`user:${userId}`).emit('refund:completed', {
        refundId: id,
        reference,
        amount,
        status: 'completed',
        timestamp: new Date()
      });

      io.to('admin').emit('transaction:completed', {
        type: 'refund',
        refundId: id,
        reference,
        amount,
        timestamp: new Date()
      });

      logger.info(`✅ Refund completed: ${reference}`);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Flutterwave refund webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Recurring Payment Webhook
// ============================================

router.post('/flutterwave/recurring', (req, res) => {
  try {
    if (!verifyFlutterwaveSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    const io = req.io;

    logger.info(`Flutterwave recurring webhook: ${event}`, {
      reference: data?.reference,
      status: data?.status
    });

    if (event === 'recurring.payment.completed') {
      const { id, reference, amount, meta } = data;

      const userId = meta?.userId;

      io.to(`user:${userId}`).emit('recurring:payment-completed', {
        paymentId: id,
        reference,
        amount,
        timestamp: new Date()
      });

      logger.info(`✅ Recurring payment completed: ${reference}`);
    } else if (event === 'recurring.payment.failed') {
      const { id, reference, meta, reason } = data;

      const userId = meta?.userId;

      io.to(`user:${userId}`).emit('recurring:payment-failed', {
        paymentId: id,
        reference,
        reason: reason || 'Recurring payment failed',
        timestamp: new Date()
      });

      logger.error(`❌ Recurring payment failed: ${reference}`);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Flutterwave recurring webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
