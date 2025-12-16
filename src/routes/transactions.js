const express = require('express');
const authMiddleware = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const router = express.Router();

// Get all transactions for user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { limit = 20, offset = 0, status } = req.query;

    const query = {
      $or: [
        { sender: req.userId },
        { receiver: req.userId },
      ],
    };

    if (status) {
      query.status = status;
    }

    const transactions = await Transaction.find(query)
      .populate('sender', 'firstName lastName profilePicture')
      .populate('receiver', 'firstName lastName profilePicture')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get transaction details
router.get('/:transactionId', authMiddleware, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.transactionId)
      .populate('sender', 'firstName lastName profilePicture email')
      .populate('receiver', 'firstName lastName profilePicture email')
      .populate('combineId', 'name');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Check if user is involved
    if (!transaction.sender._id.equals(req.userId) && !transaction.receiver._id.equals(req.userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(transaction);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// Get transaction summary
router.get('/summary/stats', authMiddleware, async (req, res) => {
  try {
    const sent = await Transaction.aggregate([
      { $match: { sender: req.userId, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const received = await Transaction.aggregate([
      { $match: { receiver: req.userId, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.json({
      totalSent: sent[0]?.total || 0 / 100,
      totalReceived: received[0]?.total || 0 / 100,
      recentTransactionCount: await Transaction.countDocuments({
        $or: [
          { sender: req.userId },
          { receiver: req.userId },
        ],
      }),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

module.exports = router;
