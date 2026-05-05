const cron = require('node-cron');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const Subscription = require('../models/Subscription');
const MerchantTransaction = require('../models/MerchantTransaction');
const Invoice = require('../models/Invoice');
const Merchant = require('../models/Merchant');
const MerchantWallet = require('../models/MerchantWallet');
const User = require('../models/User');
const { generateAndUploadInvoice } = require('./invoiceService');

let cronJob = null;

/**
 * Process subscription charges for all subscriptions due for billing
 */
const processSubscriptionCharges = async () => {
  try {
    logger.info('🔄 Starting recurring billing cycle...');

    // Find all active subscriptions due for billing
    const now = new Date();
    const dueSubscriptions = await Subscription.find({
      status: 'active',
      nextBillingDate: { $lte: now }
    }).populate('merchantId customerId').lean();

    if (dueSubscriptions.length === 0) {
      logger.info('✅ No subscriptions due for billing');
      return { processed: 0, successful: 0, failed: 0 };
    }

    logger.info(`📊 Found ${dueSubscriptions.length} subscriptions due for billing`);

    let stats = { processed: 0, successful: 0, failed: 0 };

    for (const subscription of dueSubscriptions) {
      try {
        const result = await chargeSubscription(subscription);
        stats.processed++;
        if (result.success) {
          stats.successful++;
        } else {
          stats.failed++;
        }
      } catch (error) {
        logger.error(`Failed to process subscription ${subscription._id}:`, error);
        stats.failed++;
      }
    }

    logger.info(`✅ Recurring billing cycle complete - Processed: ${stats.processed}, Successful: ${stats.successful}, Failed: ${stats.failed}`);
    return stats;
  } catch (error) {
    logger.error('❌ Error in recurring billing cron:', error);
    return { processed: 0, successful: 0, failed: 0, error: error.message };
  }
};

/**
 * Charge a single subscription
 */
const chargeSubscription = async (subscription) => {
  const subscriptionId = subscription._id;

  try {
    // Fetch fresh data to avoid stale state
    const freshSubscription = await Subscription.findById(subscriptionId).populate('merchantId customerId');
    if (!freshSubscription) {
      logger.warn(`Subscription ${subscriptionId} not found`);
      return { success: false, reason: 'not_found' };
    }

    if (freshSubscription.status !== 'active') {
      logger.warn(`Subscription ${subscriptionId} is not active (status: ${freshSubscription.status})`);
      return { success: false, reason: 'not_active' };
    }

    // Get merchant and customer details
    const merchant = await Merchant.findById(freshSubscription.merchantId);
    const customer = await User.findById(freshSubscription.customerId);
    
    if (!merchant || !customer) {
      throw new Error('Merchant or customer not found');
    }

    // Get customer payment method (assuming Paystack saved authorization)
    // For now, we'll use basic Paystack integration
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecretKey) {
      throw new Error('Paystack secret key not configured');
    }

    logger.info(`💳 Processing charge for subscription ${subscriptionId} - Amount: ₦${freshSubscription.amount}`);

    // Create pending transaction first
    const transaction = await MerchantTransaction.create({
      merchantId: freshSubscription.merchantId,
      customerId: freshSubscription.customerId,
      subscriptionId: subscriptionId,
      amount: freshSubscription.amount,
      type: 'payment',
      status: 'pending',
      paymentMethod: 'paystack',
      description: `Recurring charge for subscription: ${freshSubscription.planName}`,
      reference: `SUB-${subscriptionId}-${Date.now()}`,
      metadata: {
        subscriptionCode: freshSubscription.subscriptionCode,
        planName: freshSubscription.planName,
        cycleNumber: freshSubscription.billingCycleCount + 1
      }
    });

    // Attempt Paystack charge (assuming customer has valid authorization)
    // In production, you would need to store customer authorization code
    const chargePayload = {
      email: customer.email,
      amount: freshSubscription.amount, // Amount in kobo
      authorization_code: customer.paystackAuthorizationCode || null, // Stored from previous transaction
      reference: transaction.reference,
      metadata: {
        subscriptionId: subscriptionId.toString(),
        subscriptionCode: freshSubscription.subscriptionCode
      }
    };

    let paymentSuccess = false;
    let paystackResponse = null;

    // Only attempt Paystack charge if customer has valid authorization
    if (chargePayload.authorization_code) {
      try {
        paystackResponse = await axios.post(
          'https://api.paystack.co/transaction/charge_authorization',
          chargePayload,
          {
            headers: {
              Authorization: `Bearer ${paystackSecretKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        paymentSuccess = paystackResponse.data.status === true && paystackResponse.data.data.status === 'success';
      } catch (paymentError) {
        logger.error(`Paystack charge failed for subscription ${subscriptionId}:`, paymentError.message);
        paystackResponse = paymentError.response?.data || null;
      }
    } else {
      logger.warn(`No valid payment authorization for customer ${customer._id}. Subscription charge deferred.`);
      // Update subscription with failed attempt
      await Subscription.findByIdAndUpdate(subscriptionId, {
        $inc: { failedAttempts: 1 },
        lastFailureReason: 'no_valid_authorization',
        nextBillingDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // Retry in 24 hours
      });

      // Mark transaction as failed
      await MerchantTransaction.findByIdAndUpdate(transaction._id, {
        status: 'failed',
        failureReason: 'no_valid_authorization'
      });

      return { success: false, reason: 'no_authorization' };
    }

    if (paymentSuccess) {
      // ✅ Payment successful
      logger.info(`✅ Payment successful for subscription ${subscriptionId}`);

      // Update subscription
      const nextBillingDate = calculateNextBillingDate(
        freshSubscription.nextBillingDate,
        freshSubscription.frequency
      );

      const updateData = {
        status: 'active',
        lastBillingDate: new Date(),
        nextBillingDate: nextBillingDate,
        $inc: { 
          billingCycleCount: 1,
          totalCharges: 1
        },
        failedAttempts: 0 // Reset on successful charge
      };

      // Check if max cycles reached
      if (freshSubscription.maxBillingCycles && 
          freshSubscription.billingCycleCount + 1 >= freshSubscription.maxBillingCycles) {
        updateData.status = 'expired';
        updateData.endDate = new Date();
      }

      const updatedSubscription = await Subscription.findByIdAndUpdate(
        subscriptionId,
        updateData,
        { new: true }
      );

      // Mark transaction as successful
      await MerchantTransaction.findByIdAndUpdate(transaction._id, {
        status: 'successful',
        paystackTransactionId: paystackResponse.data.data.id,
        paystackAuthorizationCode: paystackResponse.data.data.authorization.authorization_code
      });

      // Update merchant wallet (credit available balance)
      // Deduct commission if applicable
      const commission = await calculateCommission(freshSubscription.amount, merchant);
      const netAmount = freshSubscription.amount - commission;

      await MerchantWallet.findByIdAndUpdate(
        merchant._id,
        {
          $inc: {
            availableBalance: netAmount,
            totalEarnings: freshSubscription.amount
          }
        },
        { upsert: true }
      );

      // Generate invoice if enabled
      if (freshSubscription.generateInvoice) {
        try {
          const invoice = await Invoice.create({
            merchantId: freshSubscription.merchantId,
            customerId: freshSubscription.customerId,
            subscriptionId: subscriptionId,
            items: [
              {
                description: `${freshSubscription.planName} - Cycle ${updatedSubscription.billingCycleCount}`,
                quantity: 1,
                unitPrice: freshSubscription.amount,
                amount: freshSubscription.amount
              }
            ],
            subtotal: freshSubscription.amount,
            taxRate: 0,
            taxAmount: 0,
            discountAmount: 0,
            totalAmount: freshSubscription.amount,
            status: 'sent',
            sentAt: new Date(),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days due
            metadata: {
              status: 'auto-generated',
              subscriptionCode: freshSubscription.subscriptionCode
            }
          });

          // Generate PDF
          try {
            const { pdfUrl, pdfPublicId } = await generateAndUploadInvoice(invoice, merchant);
            await Invoice.findByIdAndUpdate(invoice._id, {
              pdfUrl,
              pdfPublicId
            });
          } catch (pdfError) {
            logger.error(`Failed to generate invoice PDF for subscription ${subscriptionId}:`, pdfError);
          }

          // Link invoice to subscription
          await Subscription.findByIdAndUpdate(subscriptionId, {
            $push: { invoiceIds: invoice._id }
          });
        } catch (invoiceError) {
          logger.error(`Failed to create invoice for subscription ${subscriptionId}:`, invoiceError);
        }
      }

      // Send webhook notification to merchant
      await sendWebhookNotification(merchant, {
        event: 'subscription.charged',
        subscription: {
          id: subscriptionId.toString(),
          code: freshSubscription.subscriptionCode,
          cycle: updatedSubscription.billingCycleCount,
          amount: freshSubscription.amount
        },
        transaction: {
          id: transaction._id.toString(),
          reference: transaction.reference,
          status: 'successful'
        },
        timestamp: new Date()
      });

      return { success: true, transactionId: transaction._id };
    } else {
      // ❌ Payment failed
      logger.warn(`❌ Payment failed for subscription ${subscriptionId}`);

      // Increment failed attempts
      const failedAttempts = freshSubscription.failedAttempts + 1;
      const maxRetries = freshSubscription.maxRetryAttempts || 5;

      const failureReason = paystackResponse?.data?.message || 'Payment processing failed';

      if (failedAttempts >= maxRetries) {
        // Cancel subscription after max retries
        logger.warn(`🛑 Subscription ${subscriptionId} cancelled after ${failedAttempts} failed attempts`);
        
        await Subscription.findByIdAndUpdate(subscriptionId, {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: `Failed payment after ${maxRetries} attempts`,
          cancellationType: 'failed_payment',
          failedAttempts: failedAttempts,
          lastFailureReason: failureReason
        });

        // Send cancellation webhook
        await sendWebhookNotification(merchant, {
          event: 'subscription.cancelled',
          subscription: {
            id: subscriptionId.toString(),
            code: freshSubscription.subscriptionCode,
            reason: 'failed_payment',
            failedAttempts: failedAttempts
          },
          timestamp: new Date()
        });
      } else {
        // Schedule retry for 24 hours later
        const nextRetryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        await Subscription.findByIdAndUpdate(subscriptionId, {
          failedAttempts: failedAttempts,
          lastFailureReason: failureReason,
          nextBillingDate: nextRetryDate
        });

        // Send failure webhook with retry info
        await sendWebhookNotification(merchant, {
          event: 'subscription.charge_failed',
          subscription: {
            id: subscriptionId.toString(),
            code: freshSubscription.subscriptionCode,
            failedAttempts: failedAttempts,
            maxRetryAttempts: maxRetries
          },
          retry: {
            nextAttempt: nextRetryDate,
            remaining: maxRetries - failedAttempts
          },
          timestamp: new Date()
        });
      }

      // Mark transaction as failed
      await MerchantTransaction.findByIdAndUpdate(transaction._id, {
        status: 'failed',
        failureReason: failureReason,
        paystackResponse: paystackResponse
      });

      return { success: false, reason: 'payment_failed', retrying: failedAttempts < maxRetries };
    }
  } catch (error) {
    logger.error(`Error charging subscription ${subscriptionId}:`, error);

    // Update subscription with error
    try {
      await Subscription.findByIdAndUpdate(subscriptionId, {
        failedAttempts: subscription.failedAttempts + 1,
        lastFailureReason: error.message,
        nextBillingDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
    } catch (updateError) {
      logger.error('Failed to update subscription after error:', updateError);
    }

    return { success: false, reason: 'system_error', error: error.message };
  }
};

/**
 * Calculate next billing date based on frequency
 */
const calculateNextBillingDate = (currentDate, frequency) => {
  const nextDate = new Date(currentDate);
  
  const frequencyMap = {
    daily: 1,
    weekly: 7,
    monthly: 30,
    quarterly: 90,
    'semi-annual': 180,
    annual: 365
  };

  const daysToAdd = frequencyMap[frequency] || 30;
  nextDate.setDate(nextDate.getDate() + daysToAdd);
  
  return nextDate;
};

/**
 * Calculate commission based on merchant settings
 */
const calculateCommission = async (amount, merchant) => {
  if (!merchant.settings || !merchant.settings.commissionRate) {
    return Math.round(amount * 0.01); // Default 1% commission
  }
  
  return Math.round(amount * (merchant.settings.commissionRate / 100));
};

/**
 * Send webhook notification to merchant
 */
const sendWebhookNotification = async (merchant, payload) => {
  if (!merchant.webhookUrl) {
    return; // No webhook configured
  }

  try {
    // Sign payload with HMAC-SHA256
    const hmac = crypto.createHmac('sha256', merchant.webhookSecret || 'webhook-secret');
    hmac.update(JSON.stringify(payload));
    const signature = hmac.digest('hex');

    await axios.post(
      merchant.webhookUrl,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Wavva-Signature': signature,
          'X-Wavva-Timestamp': Date.now()
        },
        timeout: 5000
      }
    );

    logger.info(`✅ Webhook sent to merchant ${merchant._id}`);
  } catch (error) {
    logger.error(`Failed to send webhook to merchant ${merchant._id}:`, error.message);
    // Don't fail the entire process if webhook fails
  }
};

/**
 * Start the recurring billing cron job
 * Runs daily at 2 AM UTC (configurable)
 */
const startRecurringBillingCron = () => {
  if (cronJob) {
    logger.warn('Recurring billing cron already running');
    return;
  }

  const schedule = process.env.RECURRING_BILLING_CRON || '0 2 * * *'; // Daily at 2 AM UTC
  
  cronJob = cron.schedule(schedule, processSubscriptionCharges, {
    runOnInit: false
  });

  logger.info(`✅ Recurring billing cron scheduled: ${schedule}`);
  return cronJob;
};

/**
 * Stop the recurring billing cron job
 */
const stopRecurringBillingCron = () => {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('⏹️ Recurring billing cron stopped');
  }
};

/**
 * Manually trigger billing for testing
 */
const triggerBillingNow = async () => {
  logger.info('🔄 Manually triggering billing cycle...');
  return await processSubscriptionCharges();
};

module.exports = {
  startRecurringBillingCron,
  stopRecurringBillingCron,
  triggerBillingNow,
  processSubscriptionCharges
};
