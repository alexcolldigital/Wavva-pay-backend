const cron = require('node-cron');
const Settlement = require('../models/Settlement');
const MerchantWallet = require('../models/MerchantWallet');
const MerchantTransaction = require('../models/MerchantTransaction');
const Merchant = require('../models/Merchant');
const flutterwaveService = require('./flutterwave');
const logger = require('../utils/logger');

// Schedule settlement execution
// Runs daily at 9:00 AM
const startSettlementCron = () => {
  logger.info('Settlement cron job initialized. Will run daily at 09:00 UTC');

  cron.schedule('0 9 * * *', async () => {
    try {
      logger.info('🔄 Settlement cron job triggered');
      await executeScheduledSettlements();
    } catch (error) {
      logger.error('Settlement cron job error:', error);
    }
  });

  // Also schedule a test run on server start (optional, can be removed)
  // Uncomment to test settlement immediately on server start
  // executeScheduledSettlements().then(() => {
  //   logger.info('Test settlement execution completed');
  // }).catch(err => {
  //   logger.error('Test settlement execution failed:', err);
  // });
};

// Execute all scheduled settlements
const executeScheduledSettlements = async () => {
  try {
    // Find all scheduled settlements
    const scheduledSettlements = await Settlement.find({
      status: 'scheduled',
      scheduledDate: { $lte: new Date() }
    }).limit(100); // Process max 100 per run to avoid overload

    logger.info(`Found ${scheduledSettlements.length} scheduled settlements to process`);

    if (scheduledSettlements.length === 0) {
      logger.info('No settlements to process');
      return;
    }

    for (const settlement of scheduledSettlements) {
      try {
        await processSettlement(settlement);
      } catch (error) {
        logger.error(`Error processing settlement ${settlement._id}:`, error);
        // Continue with next settlement on error
      }
    }

    logger.info('✅ Settlement cron job completed successfully');
  } catch (error) {
    logger.error('Failed to execute scheduled settlements:', error);
    throw error;
  }
};

// Process individual settlement
const processSettlement = async (settlement) => {
  try {
    const merchant = await Merchant.findById(settlement.merchantId);
    const wallet = await MerchantWallet.findById(settlement.walletId);

    if (!merchant || !wallet) {
      logger.warn(`Merchant or wallet not found for settlement ${settlement._id}`);
      settlement.status = 'failed';
      settlement.failureReason = 'Merchant or wallet not found';
      settlement.failedAt = new Date();
      await settlement.save();
      return;
    }

    // Update settlement status to initiated
    settlement.status = 'initiated';
    settlement.initiatedDate = new Date();
    await settlement.save();

    logger.info(`Processing settlement ${settlement._id} for merchant ${merchant.businessName}`);

    // Get bank account details
    const bankAccount = settlement.bankAccount || merchant.bankAccount;

    if (!bankAccount || !bankAccount.verified) {
      throw new Error('Bank account not verified');
    }

    // Create the transfer using Flutterwave
    const transferResult = await flutterwaveService.createTransfer(
      bankAccount.accountNumber,
      bankAccount.bankCode,
      settlement.amount / 100, // Convert from cents to naira
      bankAccount.accountName,
      `Settlement for ${merchant.businessName}`
    );

    if (!transferResult.success) {
      throw new Error(transferResult.error || 'Transfer failed');
    }

    // Update settlement to processing
    settlement.status = 'processing';
    settlement.paymentGateway = 'flutterwave';
    settlement.paymentGatewayReference = transferResult.reference;
    settlement.paymentGatewayTransactionId = transferResult.transferId;
    await settlement.save();

    // Verify transfer status after a delay (Flutterwave processes async)
    // Schedule a verification job for 10 seconds later
    setTimeout(async () => {
      try {
        const verifyResult = await flutterwaveService.getTransferStatus(transferResult.transferId);

        if (verifyResult.success && (verifyResult.status === 'success' || verifyResult.status === 'completed')) {
          // Mark settlement as completed
          settlement.status = 'completed';
          settlement.completedDate = new Date();

          // Move settled balance to already paid
          wallet.pendingBalance -= settlement.amount;
          wallet.settledBalance += settlement.amount;
          wallet.totalSettled += settlement.amount;
          wallet.lastSettlementDate = new Date();

          await settlement.save();
          await wallet.save();

          logger.info(`✅ Settlement ${settlement._id} completed successfully`);
        } else if (verifyResult.status === 'failed') {
          // Mark as failed
          settlement.status = 'failed';
          settlement.failureReason = verifyResult.error || 'Transfer failed';
          settlement.failedAt = new Date();
          settlement.retryCount = (settlement.retryCount || 0) + 1;

          // Set next retry for 24 hours later
          const nextRetry = new Date();
          nextRetry.setHours(nextRetry.getHours() + 24);
          settlement.nextRetryDate = nextRetry;

          // Refund amount back to balance
          wallet.pendingBalance -= settlement.amount;
          wallet.balance += settlement.amount;

          await settlement.save();
          await wallet.save();

          logger.error(`❌ Settlement ${settlement._id} failed. Will retry on ${nextRetry}`);
        } else {
          // Still pending, don't do anything yet
          logger.info(`⏳ Settlement ${settlement._id} is still processing...`);
        }
      } catch (verifyError) {
        logger.error(`Verification failed for settlement ${settlement._id}:`, verifyError);
      }
    }, 10000); // Check after 10 seconds

  } catch (error) {
    logger.error(`Failed to process settlement ${settlement._id}:`, error);

    // Mark as failed
    settlement.status = 'failed';
    settlement.failureReason = error.message || 'Settlement processing failed';
    settlement.failedAt = new Date();
    settlement.retryCount = (settlement.retryCount || 0) + 1;

    // Set next retry for 24 hours later
    const nextRetry = new Date();
    nextRetry.setHours(nextRetry.getHours() + 24);
    settlement.nextRetryDate = nextRetry;

    // Refund pending amount back to balance
    const wallet = await MerchantWallet.findById(settlement.walletId);
    if (wallet) {
      wallet.pendingBalance -= settlement.amount;
      wallet.balance += settlement.amount;
      await wallet.save();
    }

    await settlement.save();

    throw error;
  }
};

// Manual settlement execution (for testing or urgent processing)
const executeSettlementNow = async (settlementId) => {
  try {
    const settlement = await Settlement.findById(settlementId);

    if (!settlement) {
      throw new Error('Settlement not found');
    }

    if (settlement.status !== 'scheduled' && settlement.status !== 'failed') {
      throw new Error(`Cannot execute settlement with status: ${settlement.status}`);
    }

    await processSettlement(settlement);
    return settlement;
  } catch (error) {
    logger.error('Manual settlement execution failed:', error);
    throw error;
  }
};

// Retry failed settlements
// Can be called manually or scheduled
const retryFailedSettlements = async () => {
  try {
    logger.info('Starting retry of failed settlements...');

    const failedSettlements = await Settlement.find({
      status: 'failed',
      nextRetryDate: { $lte: new Date() },
      retryCount: { $lt: 5 } // Max 5 retries
    }).limit(50);

    logger.info(`Found ${failedSettlements.length} failed settlements to retry`);

    for (const settlement of failedSettlements) {
      try {
        logger.info(`Retrying settlement ${settlement._id} (retry #${settlement.retryCount || 1})`);
        // Reset to scheduled state and retry
        settlement.status = 'scheduled';
        settlement.nextRetryDate = undefined;
        await settlement.save();
        await processSettlement(settlement);
      } catch (error) {
        logger.error(`Retry failed for settlement ${settlement._id}:`, error);
      }
    }

    logger.info('✅ Settlement retry job completed');
  } catch (error) {
    logger.error('Settlement retry failed:', error);
  }
};

// Schedule retry check - every 4 hours
const startRetryCheckCron = () => {
  logger.info('Retry check cron job initialized. Will check every 4 hours');

  cron.schedule('0 */4 * * *', async () => {
    try {
      await retryFailedSettlements();
    } catch (error) {
      logger.error('Retry check cron error:', error);
    }
  });
};

module.exports = {
  startSettlementCron,
  startRetryCheckCron,
  executeScheduledSettlements,
  executeSettlementNow,
  retryFailedSettlements,
  processSettlement,
};
