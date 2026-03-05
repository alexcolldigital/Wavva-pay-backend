const Merchant = require('../models/Merchant');
const MerchantTransaction = require('../models/MerchantTransaction');
const MerchantWallet = require('../models/MerchantWallet');
const Settlement = require('../models/Settlement');
const PaymentLink = require('../models/PaymentLink');

// Get Dashboard Summary
const getDashboardSummary = async (req, res) => {
  try {
    const userId = req.userId;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const wallet = await MerchantWallet.findOne({ merchantId: merchant._id });

    // Get today's transactions
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTransactions = await MerchantTransaction.find({
      merchantId: merchant._id,
      status: 'completed',
      completedAt: { $gte: today }
    });

    const todayRevenue = todayTransactions.reduce((sum, t) => sum + t.amount, 0);
    const todayCount = todayTransactions.length;

    // Get this month's transactions
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthTransactions = await MerchantTransaction.find({
      merchantId: merchant._id,
      status: 'completed',
      completedAt: { $gte: monthStart }
    });

    const monthRevenue = monthTransactions.reduce((sum, t) => sum + t.amount, 0);
    const monthCount = monthTransactions.length;

    // Get pending settlement
    const pendingSettlement = await Settlement.findOne({
      merchantId: merchant._id,
      status: 'scheduled'
    });

    res.json({
      success: true,
      summary: {
        wallet: {
          available: wallet.balance / 100,
          pending: wallet.pendingBalance / 100,
          settled: wallet.settledBalance / 100
        },
        today: {
          revenue: todayRevenue / 100,
          transactions: todayCount,
          average: todayCount > 0 ? (todayRevenue / todayCount / 100).toFixed(2) : 0
        },
        thisMonth: {
          revenue: monthRevenue / 100,
          transactions: monthCount,
          average: monthCount > 0 ? (monthRevenue / monthCount / 100).toFixed(2) : 0
        },
        nextSettlement: pendingSettlement ? {
          amount: pendingSettlement.netAmount / 100,
          scheduledDate: pendingSettlement.scheduledDate,
          status: pendingSettlement.status
        } : null,
        merchantStats: {
          totalRevenue: merchant.totalRevenue / 100,
          totalTransactions: merchant.totalTransactions,
          totalCustomers: merchant.totalCustomers
        }
      }
    });
  } catch (err) {
    console.error('Get dashboard summary error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
};

// Get Transactions History
const getTransactions = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const query = { merchantId: merchant._id };

    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const transactions = await MerchantTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await MerchantTransaction.countDocuments(query);

    res.json({
      success: true,
      transactions: transactions.map(t => ({
        _id: t._id,
        amount: t.amount / 100,
        commission: t.commission / 100,
        netAmount: t.netAmount / 100,
        currency: t.currency,
        status: t.status,
        paymentMethod: t.paymentMethod,
        customerName: t.customerName,
        customerEmail: t.customerEmail,
        createdAt: t.createdAt,
        completedAt: t.completedAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

// Get Sales Analytics
const getSalesAnalytics = async (req, res) => {
  try {
    const userId = req.userId;
    const { period = 'month' } = req.query; // day, week, month, year

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    let startDate = new Date();
    let dateFormat = '%Y-%m-%d';

    if (period === 'day') {
      startDate.setDate(startDate.getDate() - 1);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'year') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }

    const transactions = await MerchantTransaction.find({
      merchantId: merchant._id,
      status: 'completed',
      completedAt: { $gte: startDate }
    });

    // Group by date
    const analytics = {};
    transactions.forEach(t => {
      const date = t.completedAt.toISOString().split('T')[0];
      if (!analytics[date]) {
        analytics[date] = {
          date,
          revenue: 0,
          transactions: 0,
          commission: 0
        };
      }
      analytics[date].revenue += t.amount / 100;
      analytics[date].transactions += 1;
      analytics[date].commission += t.commission / 100;
    });

    const data = Object.values(analytics).sort((a, b) => new Date(a.date) - new Date(b.date));

    // Payment method breakdown
    const byPaymentMethod = {};
    transactions.forEach(t => {
      if (!byPaymentMethod[t.paymentMethod]) {
        byPaymentMethod[t.paymentMethod] = { count: 0, amount: 0 };
      }
      byPaymentMethod[t.paymentMethod].count += 1;
      byPaymentMethod[t.paymentMethod].amount += t.amount / 100;
    });

    res.json({
      success: true,
      analytics: {
        timeline: data,
        totalRevenue: transactions.reduce((sum, t) => sum + t.amount, 0) / 100,
        totalTransactions: transactions.length,
        totalCommission: transactions.reduce((sum, t) => sum + t.commission, 0) / 100,
        avgTransactionValue: transactions.length > 0 ?
          (transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length / 100).toFixed(2) : 0,
        byPaymentMethod: Object.entries(byPaymentMethod).map(([method, data]) => ({
          method,
          count: data.count,
          amount: data.amount
        }))
      }
    });
  } catch (err) {
    console.error('Get sales analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch sales analytics' });
  }
};

// Get Top Payment Links
const getTopPaymentLinks = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 5 } = req.query;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const paymentLinks = await PaymentLink.find({ merchantId: merchant._id })
      .sort({ completedCount: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      topLinks: paymentLinks.map(link => ({
        _id: link._id,
        title: link.title,
        completedCount: link.completedCount,
        failedCount: link.failedCount,
        totalValue: link.totalValue / 100,
        views: link.views,
        conversionRate: link.views > 0 ? ((link.completedCount / link.views) * 100).toFixed(2) : 0
      }))
    });
  } catch (err) {
    console.error('Get top payment links error:', err);
    res.status(500).json({ error: 'Failed to fetch top payment links' });
  }
};

module.exports = {
  getDashboardSummary,
  getTransactions,
  getSalesAnalytics,
  getTopPaymentLinks
};
