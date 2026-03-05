const Subscription = require('../models/Subscription');
const Merchant = require('../models/Merchant');
const User = require('../models/User');
const MerchantTransaction = require('../models/MerchantTransaction');
const MerchantWallet = require('../models/MerchantWallet');
const Invoice = require('../models/Invoice');
const onepipeService = require('../services/onepipe');
const { displayToCents, centsToDisplay } = require('../utils/currencyFormatter');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Create Subscription Plan
const createSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const { customerId, planName, description, amount, frequency, startDate, endDate, duration = 'indefinite', paymentMethod, generateInvoice = true, notificationEmail, metadata } = req.body;

    // Validation
    if (!customerId || !planName || !amount || !frequency) {
      return res.status(400).json({ error: 'Missing required fields: customerId, planName, amount, frequency' });
    }

    const validFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'semi-annual', 'annual'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency' });
    }

    // Get merchant and customer
    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Calculate next billing date
    const start = new Date(startDate || Date.now());
    const nextBillingDate = calculateNextBillingDate(start, frequency);

    // Create subscription
    const subscription = new Subscription({
      merchantId: merchant._id,
      customerId: customerId,
      planName,
      description,
      amount: displayToCents(amount),
      frequency,
      startDate: start,
      endDate: endDate ? new Date(endDate) : null,
      duration,
      paymentMethod,
      nextBillingDate,
      notificationEmail: notificationEmail || customer.email,
      generateInvoice,
      metadata: metadata || {}
    });

    await subscription.save();

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      subscription: {
        _id: subscription._id,
        subscriptionCode: subscription.subscriptionCode,
        planName: subscription.planName,
        amount: centsToDisplay(subscription.amount),
        frequency: subscription.frequency,
        nextBillingDate: subscription.nextBillingDate,
        status: subscription.status
      }
    });
  } catch (err) {
    console.error('Create subscription error:', err);
    res.status(500).json({ error: err.message || 'Failed to create subscription' });
  }
};

// Get Subscription
const getSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const { subscriptionId } = req.params;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      merchantId: merchant._id
    }).populate('customerId', 'email name phone');

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({
      success: true,
      subscription: formatSubscriptionResponse(subscription)
    });
  } catch (err) {
    console.error('Get subscription error:', err);
    res.status(500).json({ error: 'Failed to retrieve subscription' });
  }
};

// List Subscriptions
const listSubscriptions = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, status, customerId } = req.query;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const skip = (page - 1) * limit;
    let query = { merchantId: merchant._id };

    if (status) {
      query.status = status;
    }

    if (customerId) {
      query.customerId = customerId;
    }

    const subscriptions = await Subscription.find(query)
      .populate('customerId', 'email name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Subscription.countDocuments(query);

    res.json({
      success: true,
      subscriptions: subscriptions.map(formatSubscriptionResponse),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('List subscriptions error:', err);
    res.status(500).json({ error: 'Failed to retrieve subscriptions' });
  }
};

// Update Subscription
const updateSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const { subscriptionId } = req.params;
    const { amount, frequency, nextBillingDate, autoRenew, maxBillingCycles } = req.body;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let subscription = await Subscription.findOne({
      _id: subscriptionId,
      merchantId: merchant._id
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Update fields
    if (amount) subscription.amount = displayToCents(amount);
    if (frequency) subscription.frequency = frequency;
    if (nextBillingDate) subscription.nextBillingDate = new Date(nextBillingDate);
    if (autoRenew !== undefined) subscription.autoRenew = autoRenew;
    if (maxBillingCycles !== undefined) subscription.maxBillingCycles = maxBillingCycles;

    await subscription.save();

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription: formatSubscriptionResponse(subscription)
    });
  } catch (err) {
    console.error('Update subscription error:', err);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
};

// Pause Subscription
const pauseSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const { subscriptionId } = req.params;
    const { reason = 'Paused by customer' } = req.body;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let subscription = await Subscription.findOne({
      _id: subscriptionId,
      merchantId: merchant._id,
      status: 'active'
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Active subscription not found' });
    }

    subscription.status = 'paused';
    subscription.pausedAt = new Date();
    subscription.pauseReason = reason;
    await subscription.save();

    res.json({
      success: true,
      message: 'Subscription paused successfully',
      subscription: formatSubscriptionResponse(subscription)
    });
  } catch (err) {
    console.error('Pause subscription error:', err);
    res.status(500).json({ error: 'Failed to pause subscription' });
  }
};

// Resume Subscription
const resumeSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const { subscriptionId } = req.params;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let subscription = await Subscription.findOne({
      _id: subscriptionId,
      merchantId: merchant._id,
      status: 'paused'
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Paused subscription not found' });
    }

    subscription.status = 'active';
    subscription.pausedAt = null;
    subscription.pauseReason = null;

    // Recalculate next billing date if in the past
    if (subscription.nextBillingDate < new Date()) {
      subscription.nextBillingDate = calculateNextBillingDate(new Date(), subscription.frequency);
    }

    await subscription.save();

    res.json({
      success: true,
      message: 'Subscription resumed successfully',
      subscription: formatSubscriptionResponse(subscription)
    });
  } catch (err) {
    console.error('Resume subscription error:', err);
    res.status(500).json({ error: 'Failed to resume subscription' });
  }
};

// Cancel Subscription
const cancelSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const { subscriptionId } = req.params;
    const { reason = 'Subscription cancelled', cancellationType = 'customer_request' } = req.body;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let subscription = await Subscription.findOne({
      _id: subscriptionId,
      merchantId: merchant._id
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    subscription.cancellationReason = reason;
    subscription.cancellationType = cancellationType;
    await subscription.save();

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      subscription: formatSubscriptionResponse(subscription)
    });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
};

// Get Subscription Analytics
const getSubscriptionAnalytics = async (req, res) => {
  try {
    const userId = req.userId;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const subscriptions = await Subscription.find({ merchantId: merchant._id });

    const analytics = {
      totalSubscriptions: subscriptions.length,
      activeSubscriptions: subscriptions.filter(s => s.status === 'active').length,
      pausedSubscriptions: subscriptions.filter(s => s.status === 'paused').length,
      cancelledSubscriptions: subscriptions.filter(s => s.status === 'cancelled').length,
      expiredSubscriptions: subscriptions.filter(s => s.status === 'expired').length,
      monthlyRecurringRevenue: calculateMRR(subscriptions),
      totalRecurringRevenue: centsToDisplay(subscriptions.reduce((sum, s) => sum + s.amount, 0)),
      subscriptionsByFrequency: getSubscriptionsByFrequency(subscriptions),
      upcomingBillings: subscriptions
        .filter(s => s.status === 'active')
        .sort((a, b) => a.nextBillingDate - b.nextBillingDate)
        .slice(0, 10)
        .map(s => ({
          subscriptionCode: s.subscriptionCode,
          customerId: s.customerId,
          amount: centsToDisplay(s.amount),
          nextBillingDate: s.nextBillingDate
        }))
    };

    res.json({
      success: true,
      analytics
    });
  } catch (err) {
    console.error('Get subscription analytics error:', err);
    res.status(500).json({ error: 'Failed to retrieve analytics' });
  }
};

// Helper Functions

function calculateNextBillingDate(startDate, frequency) {
  const date = new Date(startDate);
  const frequencyMap = {
    'daily': { days: 1 },
    'weekly': { days: 7 },
    'monthly': { months: 1 },
    'quarterly': { months: 3 },
    'semi-annual': { months: 6 },
    'annual': { years: 1 }
  };

  const interval = frequencyMap[frequency];
  if (interval.days) {
    date.setDate(date.getDate() + interval.days);
  } else if (interval.months) {
    date.setMonth(date.getMonth() + interval.months);
  } else if (interval.years) {
    date.setFullYear(date.getFullYear() + interval.years);
  }

  return date;
}

function formatSubscriptionResponse(subscription) {
  return {
    _id: subscription._id,
    subscriptionCode: subscription.subscriptionCode,
    planName: subscription.planName,
    description: subscription.description,
    amount: centsToDisplay(subscription.amount),
    frequency: subscription.frequency,
    status: subscription.status,
    customerId: subscription.customerId,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    nextBillingDate: subscription.nextBillingDate,
    autoRenew: subscription.autoRenew,
    totalCharges: subscription.totalCharges,
    createdAt: subscription.createdAt
  };
}

function calculateMRR(subscriptions) {
  const monthlySubscriptions = subscriptions.filter(s => 
    s.status === 'active' && 
    (s.frequency === 'monthly' || s.frequency === 'annual' || s.frequency === 'weekly')
  );

  let mrr = 0;
  monthlySubscriptions.forEach(s => {
    if (s.frequency === 'monthly') {
      mrr += s.amount;
    } else if (s.frequency === 'annual') {
      mrr += s.amount / 12;
    } else if (s.frequency === 'weekly') {
      mrr += (s.amount * 52) / 12;
    }
  });

  return centsToDisplay(mrr);
}

function getSubscriptionsByFrequency(subscriptions) {
  const byFrequency = {
    daily: 0,
    weekly: 0,
    monthly: 0,
    quarterly: 0,
    'semi-annual': 0,
    annual: 0
  };

  subscriptions.forEach(s => {
    if (s.status === 'active') {
      byFrequency[s.frequency]++;
    }
  });

  return byFrequency;
}

module.exports = {
  createSubscription,
  getSubscription,
  listSubscriptions,
  updateSubscription,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  getSubscriptionAnalytics
};
