const express = require('express');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const unifiedLedgerService = require('../services/unifiedLedgerService');
const logger = require('../utils/logger');
const router = express.Router();

let emitTransactionUpdate;
try {
  emitTransactionUpdate = require('../controllers/transactionsController').emitTransactionUpdate;
} catch (err) {
  logger.warn('Transaction controller not available for real-time notifications');
  emitTransactionUpdate = () => {};
}

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

  if (hash !== signature) {
    logger.warn('Invalid webhook signature', { expected: hash, received: signature });
    return false;
  }

  return true;
}

async function findUserByVirtualAccount(accountNumber) {
  let user = await User.findOne({ 'virtualAccount.accountNumber': accountNumber });
  if (user) {
    return user;
  }

  const wallet = await Wallet.findOne({ virtualAccountNumber: accountNumber });
  if (!wallet) {
    return null;
  }

  return User.findById(wallet.userId);
}

async function processAccountCreditWebhook(webhook) {
  const accountNumber = webhook.accountNumber || webhook.account_number;
  const amount = Number(webhook.amount || 0);
  const reference = webhook.reference;
  const senderName = webhook.senderName || webhook.sender_name || 'Unknown Sender';
  const senderAccountNumber = webhook.senderAccountNumber || webhook.sender_account_number || 'Unknown';
  const user = await findUserByVirtualAccount(accountNumber);

  if (!user) {
    logger.warn(`User not found for virtual account: ${accountNumber}`);
    return { success: true };
  }

  let transaction = await Transaction.findOne({ paystackReference: reference });
  const amountInCents = Math.round(amount * 100);

  if (!transaction) {
    transaction = new Transaction({
      sender: null,
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
  } else {
    if (transaction.metadata?.ledgerSettledAt) {
      return { success: true, duplicate: true };
    }
    transaction.status = 'completed';
    transaction.metadata = { ...transaction.metadata, webhookData: webhook };
  }

  await transaction.save();

  await unifiedLedgerService.processVirtualAccountCredit({
    userId: user._id,
    transactionId: transaction._id,
    amount: amountInCents,
    currency: 'NGN',
    provider: 'wema',
    providerReference: reference,
    reference,
    description: transaction.description,
    metadata: transaction.metadata,
  });

  transaction.metadata = {
    ...transaction.metadata,
    ledgerSettledAt: new Date(),
  };
  await transaction.save();

  emitTransactionUpdate(transaction, 'status_changed');

  const refreshedWallet = await Wallet.findOne({ userId: user._id });
  logger.info('Virtual account credit settled', {
    userId: user._id,
    amount,
    balance: (refreshedWallet?.balance || 0) / 100,
    reference
  });

  return { success: true };
}

router.post('/wema-account-credit', async (req, res) => {
  try {
    const skipVerification = !process.env.WEMA_SECRET_KEY && !process.env.WEMA_API_SECRET;

    if (!skipVerification && !verifyWemaWebhook(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook = req.body;
    logger.info(`Wema webhook received: ${webhook.event}`, {
      accountNumber: webhook.accountNumber || webhook.account_number,
      amount: webhook.amount,
      reference: webhook.reference
    });

    if (webhook.event === 'account.credit' || webhook.event === 'CREDIT') {
      await processAccountCreditWebhook(webhook);
    } else if (webhook.event === 'account.debit' || webhook.event === 'DEBIT') {
      const transaction = await Transaction.findOne({ paystackReference: webhook.reference });

      if (transaction) {
        transaction.status = 'completed';
        transaction.metadata = { ...transaction.metadata, webhookData: webhook };
        await transaction.save();
        emitTransactionUpdate(transaction, 'status_changed');
        logger.info(`Virtual account debit transaction ${transaction._id} marked as completed`);
      }
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Wema webhook error:', err);
    res.status(200).json({ success: true, error: err.message });
  }
});

router.post('/wema-events', async (req, res) => {
  try {
    const skipVerification = !process.env.WEMA_SECRET_KEY && !process.env.WEMA_API_SECRET;

    if (!skipVerification && !verifyWemaWebhook(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook = req.body;
    logger.info(`Wema general webhook received: ${webhook.event}`, { data: webhook });

    if (webhook.event === 'account.credit' || webhook.event === 'CREDIT') {
      await processAccountCreditWebhook(webhook);
      return res.json({ success: true });
    }

    logger.info(`Unhandled Wema webhook event: ${webhook.event}`);
    res.json({ success: true });
  } catch (err) {
    logger.error('Wema general webhook error:', err);
    res.status(200).json({ success: true, error: err.message });
  }
});

router.post('/wema-nip-transfer', async (req, res) => {
  try {
    const skipVerification = !process.env.WEMA_SECRET_KEY && !process.env.WEMA_API_SECRET;

    if (!skipVerification && !verifyWemaWebhook(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook = req.body;
    logger.info(`Wema NIP transfer webhook received: ${webhook.event}`, {
      transferId: webhook.transferId,
      status: webhook.status,
      reference: webhook.reference
    });

    if (webhook.event === 'transfer.completed' || webhook.event === 'transfer.failed') {
      const transaction = await Transaction.findOne({ paystackReference: webhook.reference });

      if (transaction) {
        transaction.status = webhook.event === 'transfer.completed' ? 'completed' : 'failed';
        if (webhook.event === 'transfer.failed') {
          transaction.failureReason = webhook.failureReason || 'Transfer failed';
        }
        transaction.metadata = { ...transaction.metadata, webhookData: webhook };
        await transaction.save();
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

router.post('/wema-settlement', async (req, res) => {
  try {
    const skipVerification = !process.env.WEMA_SECRET_KEY && !process.env.WEMA_API_SECRET;

    if (!skipVerification && !verifyWemaWebhook(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook = req.body;
    logger.info(`Wema settlement webhook: ${webhook.event}`, {
      settlementId: webhook.settlementId,
      amount: webhook.amount,
      status: webhook.status
    });

    if (webhook.event === 'settlement.completed') {
      logger.info(`Settlement ${webhook.settlementId} completed successfully`);
    } else if (webhook.event === 'settlement.failed') {
      logger.warn(`Settlement ${webhook.settlementId} failed`, webhook.failureReason);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Wema settlement webhook error:', err);
    res.status(200).json({ success: true, error: err.message });
  }
});

router.get('/wema-health', async (req, res) => {
  res.json({ status: 'active', service: 'wema-webhooks' });
});

module.exports = router;
