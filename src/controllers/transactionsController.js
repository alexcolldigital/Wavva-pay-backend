const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

// Import socket handler for real-time notifications
let io;
try {
  io = require('../websockets/socketHandler');
} catch (err) {
  logger.warn('Socket handler not available for real-time notifications');
}

/**
 * Emit real-time transaction update to relevant users
 * @param {Object} transaction - Transaction object
 * @param {string} eventType - Type of event (created, updated, status_changed)
 */
const emitTransactionUpdate = (transaction, eventType = 'updated') => {
  if (!io || !io.io) return;

  try {
    const transactionData = {
      id: transaction._id,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      senderId: transaction.sender,
      receiverId: transaction.receiver,
      timestamp: transaction.createdAt || transaction.updatedAt,
      eventType
    };

    // Emit to sender if exists
    if (transaction.sender) {
      io.io.to(`user:${transaction.sender}`).emit('transaction:update', transactionData);
    }

    // Emit to receiver if exists and different from sender
    if (transaction.receiver && transaction.receiver.toString() !== transaction.sender?.toString()) {
      io.io.to(`user:${transaction.receiver}`).emit('transaction:update', transactionData);
    }

    logger.info(`Real-time transaction update emitted: ${eventType}`, {
      transactionId: transaction._id,
      sender: transaction.sender,
      receiver: transaction.receiver
    });
  } catch (err) {
    logger.error('Failed to emit real-time transaction update:', err.message);
  }
};

// Get all transactions for user
const getTransactions = async (req, res) => {
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
};

// Get transaction details
const getTransactionDetails = async (req, res) => {
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
};

// Get transaction summary
const getTransactionSummary = async (req, res) => {
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
};

module.exports = {
  getTransactions,
  getTransactionDetails,
  getTransactionSummary,
  emitTransactionUpdate,
};
