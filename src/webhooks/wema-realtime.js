const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const crypto = require('crypto');

const WEMA_WEBHOOK_SECRET = process.env.WEMA_WEBHOOK_SECRET;

// Verify Wema webhook signature
function verifyWemaSignature(req) {
  if (!WEMA_WEBHOOK_SECRET) {
    logger.warn('WEMA_WEBHOOK_SECRET not configured');
    return true;
  }

  const signature = req.headers['x-wema-signature'];
  const body = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', WEMA_WEBHOOK_SECRET).update(body).digest('hex');

  return signature === hash;
}

// ============================================
// Account Funding Webhook
// ============================================

router.post('/wema/funding', (req, res) => {
  try {
    if (!verifyWemaSignature(req)) {
      logger.warn('Invalid Wema webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    const io = req.io;

    logger.info(`Wema funding webhook: ${event}`, data);

    if (event === 'account.credited') {
      const { accountId, amount, reference, narration, timestamp } = data;

      // Broadcast to user's socket
      io.to(`user:${accountId}`).emit('wallet:funded', {
        amount,
        reference,
        narration,
        status: 'completed',
        timestamp,
        source: 'bank_transfer'
      });

      // Broadcast to admin dashboard
      io.to('admin').emit('transaction:completed', {
        type: 'funding',
        accountId,
        amount,
        reference,
        timestamp
      });

      logger.info(`✅ Account ${accountId} credited: ${amount}`);
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (err) {
    logger.error('Wema funding webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Transfer Status Webhook
// ============================================

router.post('/wema/transfer', (req, res) => {
  try {
    if (!verifyWemaSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    const io = req.io;

    logger.info(`Wema transfer webhook: ${event}`, data);

    if (event === 'transfer.completed') {
      const { transferId, reference, sourceAccountId, amount, status, timestamp } = data;

      io.to(`user:${sourceAccountId}`).emit('transfer:completed', {
        transferId,
        reference,
        amount,
        status,
        timestamp
      });

      logger.info(`✅ Transfer ${transferId} completed`);
    } else if (event === 'transfer.failed') {
      const { transferId, reference, sourceAccountId, reason, timestamp } = data;

      io.to(`user:${sourceAccountId}`).emit('transfer:failed', {
        transferId,
        reference,
        reason,
        timestamp
      });

      logger.error(`❌ Transfer ${transferId} failed: ${reason}`);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Wema transfer webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// KYC Verification Webhook
// ============================================

router.post('/wema/kyc', (req, res) => {
  try {
    if (!verifyWemaSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    const io = req.io;

    logger.info(`Wema KYC webhook: ${event}`, data);

    if (event === 'kyc.verified') {
      const { userId, verificationType, status, tier, timestamp } = data;

      io.to(`user:${userId}`).emit('kyc:verified', {
        type: verificationType,
        status,
        tier,
        timestamp
      });

      logger.info(`✅ KYC verified for user ${userId}: ${verificationType}`);
    } else if (event === 'kyc.failed') {
      const { userId, verificationType, reason, timestamp } = data;

      io.to(`user:${userId}`).emit('kyc:failed', {
        type: verificationType,
        reason,
        timestamp
      });

      logger.error(`❌ KYC failed for user ${userId}: ${reason}`);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Wema KYC webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Compliance & Fraud Alert Webhook
// ============================================

router.post('/wema/compliance', (req, res) => {
  try {
    if (!verifyWemaSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    const io = req.io;

    logger.info(`Wema compliance webhook: ${event}`, data);

    if (event === 'compliance.alert') {
      const { accountId, alertType, severity, description, timestamp } = data;

      io.to('admin').emit('compliance:alert', {
        accountId,
        alertType,
        severity,
        description,
        timestamp
      });

      logger.warn(`⚠️  Compliance alert for account ${accountId}: ${alertType}`);
    } else if (event === 'fraud.detected') {
      const { transactionId, accountId, riskLevel, reason, timestamp } = data;

      io.to(`user:${accountId}`).emit('fraud:detected', {
        transactionId,
        riskLevel,
        reason,
        timestamp
      });

      io.to('admin').emit('fraud:alert', {
        transactionId,
        accountId,
        riskLevel,
        reason,
        timestamp
      });

      logger.error(`🚨 Fraud detected: ${transactionId} - ${reason}`);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Wema compliance webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Account Limit Webhook
// ============================================

router.post('/wema/limits', (req, res) => {
  try {
    if (!verifyWemaSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    const io = req.io;

    logger.info(`Wema limits webhook: ${event}`, data);

    if (event === 'limit.exceeded') {
      const { accountId, limitType, currentUsage, limit, timestamp } = data;

      io.to(`user:${accountId}`).emit('limit:exceeded', {
        limitType,
        currentUsage,
        limit,
        timestamp
      });

      logger.warn(`⚠️  Limit exceeded for account ${accountId}: ${limitType}`);
    } else if (event === 'limit.upgraded') {
      const { accountId, tier, newLimits, timestamp } = data;

      io.to(`user:${accountId}`).emit('limit:upgraded', {
        tier,
        newLimits,
        timestamp
      });

      logger.info(`✅ Limits upgraded for account ${accountId} to tier ${tier}`);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Wema limits webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
