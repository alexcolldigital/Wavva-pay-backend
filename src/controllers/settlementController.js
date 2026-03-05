const Merchant = require('../models/Merchant');
const MerchantWallet = require('../models/MerchantWallet');
const MerchantTransaction = require('../models/MerchantTransaction');
const Settlement = require('../models/Settlement');
const { createTransfer } = require('../services/onepipe');

// Request Manual Settlement
const requestSettlement = async (req, res) => {
  try {
    const userId = req.userId;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    if (!merchant.bankAccount || !merchant.bankAccount.verified) {
      return res.status(400).json({ error: 'Please add and verify a bank account first' });
    }

    const wallet = await MerchantWallet.findOne({ merchantId: merchant._id });
    if (!wallet) {
      return res.status(404).json({ error: 'Merchant wallet not found' });
    }

    const amountInCents = Math.round(amount * 100);
    if (wallet.balance < amountInCents) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        available: wallet.balance / 100
      });
    }

    // Create settlement record
    const settlement = new Settlement({
      merchantId: merchant._id,
      walletId: wallet._id,
      amount: amountInCents,
      currency: wallet.currency,
      commission: 0, // Already deducted in transactions
      platformFee: Math.round(amountInCents * 0.01), // 1% platform fee
      netAmount: amountInCents - Math.round(amountInCents * 0.01),
      status: 'initiated',
      bankAccount: merchant.bankAccount,
      paymentGateway: 'paystack',
      description: 'Manual settlement request',
      reference: `SETTLE_${merchant._id.toString().substring(0, 8)}_${Date.now()}`,
      scheduledDate: new Date()
    });

    await settlement.save();

    // Deduct from available balance, add to pending
    wallet.balance -= amountInCents;
    wallet.pendingBalance += amountInCents;
    await wallet.save();

    res.json({
      success: true,
      message: 'Settlement request initiated',
      settlement: {
        _id: settlement._id,
        amount: settlement.amount / 100,
        platformFee: settlement.platformFee / 100,
        netAmount: settlement.netAmount / 100,
        status: settlement.status,
        reference: settlement.reference,
        createdAt: settlement.createdAt
      }
    });
  } catch (err) {
    console.error('Request settlement error:', err);
    res.status(500).json({ error: 'Failed to initiate settlement' });
  }
};

// Get Settlement History
const getSettlementHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, status } = req.query;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const query = { merchantId: merchant._id };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const settlements = await Settlement.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Settlement.countDocuments(query);

    res.json({
      success: true,
      settlements: settlements.map(s => ({
        _id: s._id,
        amount: s.amount / 100,
        netAmount: s.netAmount / 100,
        platformFee: s.platformFee / 100,
        status: s.status,
        reference: s.reference,
        bankAccount: s.bankAccount,
        scheduledDate: s.scheduledDate,
        completedDate: s.completedDate,
        createdAt: s.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Get settlement history error:', err);
    res.status(500).json({ error: 'Failed to fetch settlement history' });
  }
};

// Get Settlement Details
const getSettlementDetails = async (req, res) => {
  try {
    const userId = req.userId;
    const { settlementId } = req.params;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const settlement = await Settlement.findOne({
      _id: settlementId,
      merchantId: merchant._id
    }).populate('transactions');

    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    res.json({
      success: true,
      settlement: {
        _id: settlement._id,
        amount: settlement.amount / 100,
        commission: settlement.commission / 100,
        platformFee: settlement.platformFee / 100,
        netAmount: settlement.netAmount / 100,
        status: settlement.status,
        reference: settlement.reference,
        transactionCount: settlement.transactionCount,
        bankAccount: settlement.bankAccount,
        scheduledDate: settlement.scheduledDate,
        initiatedDate: settlement.initiatedDate,
        completedDate: settlement.completedDate,
        failureReason: settlement.failureReason,
        notes: settlement.notes
      },
      transactions: settlement.transactions.slice(0, 20).map(t => ({
        _id: t._id,
        amount: t.amount / 100,
        status: t.status,
        customerName: t.customerName,
        createdAt: t.createdAt
      }))
    });
  } catch (err) {
    console.error('Get settlement details error:', err);
    res.status(500).json({ error: 'Failed to fetch settlement details' });
  }
};

// Cancel Pending Settlement
const cancelSettlement = async (req, res) => {
  try {
    const userId = req.userId;
    const { settlementId } = req.params;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const settlement = await Settlement.findOne({
      _id: settlementId,
      merchantId: merchant._id
    });

    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    if (settlement.status !== 'scheduled' && settlement.status !== 'initiated') {
      return res.status(400).json({ error: 'Can only cancel pending settlements' });
    }

    // Refund to available balance
    const wallet = await MerchantWallet.findById(settlement.walletId);
    wallet.balance += settlement.amount;
    wallet.pendingBalance -= settlement.amount;
    await wallet.save();

    settlement.status = 'cancelled';
    await settlement.save();

    res.json({
      success: true,
      message: 'Settlement cancelled successfully',
      settlement: {
        _id: settlement._id,
        status: settlement.status
      }
    });
  } catch (err) {
    console.error('Cancel settlement error:', err);
    res.status(500).json({ error: 'Failed to cancel settlement' });
  }
};

// Get Pending Settlement
const getPendingSettlement = async (req, res) => {
  try {
    const userId = req.userId;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const pendingSettlement = await Settlement.findOne({
      merchantId: merchant._id,
      status: { $in: ['scheduled', 'initiated', 'processing'] }
    });

    if (!pendingSettlement) {
      return res.json({
        success: true,
        settlement: null
      });
    }

    res.json({
      success: true,
      settlement: {
        _id: pendingSettlement._id,
        amount: pendingSettlement.amount / 100,
        netAmount: pendingSettlement.netAmount / 100,
        platformFee: pendingSettlement.platformFee / 100,
        status: pendingSettlement.status,
        scheduledDate: pendingSettlement.scheduledDate,
        createdAt: pendingSettlement.createdAt
      }
    });
  } catch (err) {
    console.error('Get pending settlement error:', err);
    res.status(500).json({ error: 'Failed to fetch pending settlement' });
  }
};

module.exports = {
  requestSettlement,
  getSettlementHistory,
  getSettlementDetails,
  cancelSettlement,
  getPendingSettlement
};
