const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Initialize Socket.IO handlers
 * @param {Object} io - Socket.IO instance
 */
function setupSocketHandlers(io) {
  // Map to track user connections
  const userConnections = new Map();
  
  // Middleware to verify token
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      socket.userId = decoded.userId;
      socket.userRole = decoded.role || 'user';
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    const userRole = socket.userRole;

    logger.info(`User connected: ${userId}`, { socketId: socket.id });
    userConnections.set(userId, socket.id);

    /**
     * Admin Dashboard - Real-time Stats
     */
    socket.on('admin:subscribe', async () => {
      if (userRole !== 'admin') {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      // Join admin room
      socket.join('admin_dashboard');
      logger.info('Admin subscribed to stats', { userId, socketId: socket.id });

      try {
        // Send initial stats
        const stats = await getAdminStats();
        socket.emit('admin:stats-update', stats);
      } catch (error) {
        logger.error('Failed to get admin stats', error.message);
      }
    });

    /**
     * NFC - Start Reading
     */
    socket.on('nfc:start-reading', async () => {
      socket.join(`nfc:${userId}`);
      logger.info('NFC reading started', { userId });
      socket.emit('nfc:status', { status: 'reading' });
    });

    /**
     * NFC - Stop Reading
     */
    socket.on('nfc:stop-reading', () => {
      socket.leave(`nfc:${userId}`);
      logger.info('NFC reading stopped', { userId });
      socket.emit('nfc:status', { status: 'idle' });
    });

    /**
     * NFC - Simulate Tag Read (for testing)
     */
    socket.on('nfc:read', (data) => {
      logger.info('NFC tag read', { userId, tag: data.tag });
      
      // Broadcast to user's NFC room
      io.to(`nfc:${userId}`).emit('nfc:read', {
        tag: data.tag,
        recipientId: data.recipientId || null,
        timestamp: new Date()
      });
    });

    /**
     * NFC - Process Transaction
     */
    socket.on('nfc:process-transaction', async (data) => {
      const { transaction, pin } = data;

      try {
        logger.info('Processing NFC transaction', {
          userId,
          transactionId: transaction.id
        });

        // Update transaction status
        socket.emit('nfc:transaction-update', {
          transaction: { ...transaction, status: 'processing' },
          message: 'Processing transaction...'
        });

        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Mark as completed
        const completedTransaction = {
          ...transaction,
          status: 'completed',
          message: 'Transaction completed successfully'
        };

        socket.emit('nfc:transaction-complete', {
          transaction: completedTransaction
        });

        // Broadcast to admin for real-time update
        io.to('admin_dashboard').emit('admin:chart-update', {
          name: new Date().toLocaleTimeString(),
          transactions: Math.random() * 1000,
          users: Math.random() * 200
        });

      } catch (error) {
        logger.error('NFC transaction failed', error.message);
        socket.emit('nfc:error', {
          error: error.message || 'Transaction failed'
        });
      }
    });

    /**
     * NFC - Cancel Transaction
     */
    socket.on('nfc:cancel-transaction', (data) => {
      logger.info('NFC transaction cancelled', { userId, transactionId: data.id });
      socket.emit('nfc:status', { status: 'idle' });
    });

    /**
     * Fraud Alert Simulation (for testing)
     */
    socket.on('fraud:simulate-alert', async () => {
      if (userRole !== 'admin') {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      const fraudAlert = {
        id: `alert_${Date.now()}`,
        userId: 'user_' + Math.random().toString(36).substr(2, 9),
        type: 'high_velocity_transaction',
        risk: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
        status: 'pending',
        timestamp: new Date(),
        message: 'Unusual transaction activity detected'
      };

      io.to('admin_dashboard').emit('admin:fraud-alert', fraudAlert);
      logger.info('Fraud alert simulated', fraudAlert);
    });

    /**
     * Admin Users - Subscribe to updates
     */
    socket.on('admin:subscribe-users', () => {
      if (userRole !== 'admin') {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      socket.join('admin_users');
      logger.info('Admin subscribed to user updates', { userId, socketId: socket.id });
    });

    /**
     * Split Bills - Subscribe to updates
     */
    socket.on('split_bills:subscribe', (data) => {
      const { billId } = data || {};
      if (billId) {
        socket.join(`split_bill:${billId}`);
        logger.info(`User subscribed to split bill: ${billId}`, { userId });
      } else {
        socket.join(`user_split_bills:${userId}`);
        logger.info(`User subscribed to their split bills`, { userId });
      }
    });

    /**
     * Split Bills - Unsubscribe
     */
    socket.on('split_bills:unsubscribe', (data) => {
      const { billId } = data || {};
      if (billId) {
        socket.leave(`split_bill:${billId}`);
        logger.info(`User unsubscribed from split bill: ${billId}`, { userId });
      } else {
        socket.leave(`user_split_bills:${userId}`);
        logger.info(`User unsubscribed from their split bills`, { userId });
      }
    });

    /**
     * Group Payments - Subscribe to updates
     */
    socket.on('group_payments:subscribe', (data) => {
      const { groupId } = data || {};
      if (groupId) {
        socket.join(`group_payment:${groupId}`);
        logger.info(`User subscribed to group payment: ${groupId}`, { userId });
      } else {
        socket.join(`user_group_payments:${userId}`);
        logger.info(`User subscribed to their group payments`, { userId });
      }
    });

    /**
     * Group Payments - Unsubscribe
     */
    socket.on('group_payments:unsubscribe', (data) => {
      const { groupId } = data || {};
      if (groupId) {
        socket.leave(`group_payment:${groupId}`);
        logger.info(`User unsubscribed from group payment: ${groupId}`, { userId });
      } else {
        socket.leave(`user_group_payments:${userId}`);
        logger.info(`User unsubscribed from their group payments`, { userId });
      }
    });

    /**
     * Group Chat - Send Message
     */
    socket.on('group_chat:send_message', async (data) => {
      const { groupId, message, messageType = 'text' } = data;

      try {
        // Verify user is member of the group
        const GroupPayment = require('../models/GroupPayment');
        const group = await GroupPayment.findById(groupId);

        if (!group) {
          socket.emit('error', { message: 'Group not found' });
          return;
        }

        const isMember = group.members.some(member =>
          member.userId.toString() === userId
        );

        if (!isMember && group.createdBy.toString() !== userId) {
          socket.emit('error', { message: 'Not authorized for this group' });
          return;
        }

        const chatMessage = {
          id: `msg_${Date.now()}`,
          groupId,
          senderId: userId,
          message,
          messageType,
          timestamp: new Date(),
          sender: await User.findById(userId).select('firstName lastName username')
        };

        // Broadcast to all group members
        io.to(`group_payment:${groupId}`).emit('group_chat:new_message', chatMessage);
        logger.info(`Group chat message sent`, { groupId, userId, messageType });

      } catch (error) {
        logger.error('Group chat message failed', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    /**
     * Split Bills Chat - Send Message
     */
    socket.on('split_bill_chat:send_message', async (data) => {
      const { requestId, message, messageType = 'text' } = data;

      try {
        // Verify user is participant in the split bill
        const PaymentRequest = require('../models/PaymentRequest');
        const request = await PaymentRequest.findById(requestId);

        if (!request) {
          socket.emit('error', { message: 'Split bill request not found' });
          return;
        }

        const isParticipant = request.participants.some(participant =>
          participant.userId.toString() === userId
        );

        if (!isParticipant && request.requestedBy.toString() !== userId) {
          socket.emit('error', { message: 'Not authorized for this split bill' });
          return;
        }

        const chatMessage = {
          id: `msg_${Date.now()}`,
          requestId,
          senderId: userId,
          message,
          messageType,
          timestamp: new Date(),
          sender: await User.findById(userId).select('firstName lastName username')
        };

        // Broadcast to all participants
        io.to(`split_bill_chat:${requestId}`).emit('split_bill_chat:new_message', chatMessage);
        logger.info(`Split bill chat message sent`, { requestId, userId, messageType });

      } catch (error) {
        logger.error('Split bill chat message failed', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    /**
     * Split Bills Chat - Subscribe
     */
    socket.on('split_bill_chat:subscribe', (data) => {
      const { requestId } = data;
      socket.join(`split_bill_chat:${requestId}`);
      logger.info(`User subscribed to split bill chat`, { userId, requestId });
    });

    /**
     * Split Bills Chat - Unsubscribe
     */
    socket.on('split_bill_chat:unsubscribe', (data) => {
      const { requestId } = data;
      socket.leave(`split_bill_chat:${requestId}`);
      logger.info(`User unsubscribed from split bill chat`, { userId, requestId });
    });

    /**
     * Generic Room Leave
     */
    socket.on('leave_room', (room) => {
      socket.leave(room);
      logger.info(`User left room: ${room}`, { userId, socketId: socket.id });
    });

    /**
     * Disconnect
     */
    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${userId}`, { socketId: socket.id });
      userConnections.delete(userId);
      
      // Clean up rooms
      socket.rooms.forEach(room => {
        if (room !== socket.id) {
          socket.leave(room);
        }
      });
    });

    /**
     * Error handling
     */
    socket.on('error', (error) => {
      logger.error('Socket error', error);
    });
  });
}

/**
 * Get admin stats
 */
async function getAdminStats() {
  try {
    const totalUsers = await User.countDocuments({ accountStatus: 'active' });
    const activeUsers = await User.countDocuments({
      accountStatus: 'active',
      // Add logic to determine active users based on recent activity
    });

    return {
      totalUsers,
      activeUsers: Math.floor(activeUsers * 0.7), // Assume 70% are active
      totalTransactionVolume: Math.random() * 1000000,
      fraudAlerts: Math.floor(Math.random() * 50)
    };
  } catch (error) {
    logger.error('Failed to get admin stats', error.message);
    return {
      totalUsers: 0,
      activeUsers: 0,
      totalTransactionVolume: 0,
      fraudAlerts: 0
    };
  }
}

/**
 * Emit stats update to all admin clients
 */
async function broadcastAdminStatsUpdate(io) {
  try {
    const stats = await getAdminStats();
    io.to('admin_dashboard').emit('admin:stats-update', stats);
  } catch (error) {
    logger.error('Failed to broadcast stats', error.message);
  }
}

/**
 * Emit new user notification to admins
 */
function broadcastNewUser(io, user) {
  io.to('admin_dashboard').emit('admin:new-user', {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    createdAt: user.createdAt,
    accountStatus: user.accountStatus
  });
}

/**
 * Emit fraud alert to admins
 */
function broadcastFraudAlert(io, alert) {
  io.to('admin_dashboard').emit('admin:fraud-alert', alert);
}

/**
 * Emit user status update to admins
 */
function broadcastUserStatusUpdate(io, userId, status) {
  io.to('admin_users').emit('admin:user-status-update', {
    userId,
    status,
    timestamp: new Date()
  });
}

/**
 * Emit user list update to admins
 */
function broadcastUsersUpdate(io, users) {
  io.to('admin_users').emit('admin:users-update', users);
}

/**
 * Broadcast new transaction to admin dashboard
 */
function broadcastNewTransaction(io, transaction) {
  io.to('admin_transactions').emit('transaction:created', {
    id: transaction._id,
    sender: {
      _id: transaction.sender._id,
      firstName: transaction.sender.firstName,
      lastName: transaction.sender.lastName,
      username: transaction.sender.username,
      email: transaction.sender.email,
      profilePicture: transaction.sender.profilePicture
    },
    receiver: {
      _id: transaction.receiver._id,
      firstName: transaction.receiver.firstName,
      lastName: transaction.receiver.lastName,
      username: transaction.receiver.username,
      email: transaction.receiver.email,
      profilePicture: transaction.receiver.profilePicture
    },
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    type: transaction.type,
    description: transaction.description,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt
  });
}

/**
 * Broadcast transaction status update to admin dashboard
 */
function broadcastTransactionUpdate(io, transaction) {
  io.to('admin_transactions').emit('transaction:updated', {
    id: transaction._id,
    sender: {
      _id: transaction.sender._id,
      firstName: transaction.sender.firstName,
      lastName: transaction.sender.lastName,
      username: transaction.sender.username,
      email: transaction.sender.email,
      profilePicture: transaction.sender.profilePicture
    },
    receiver: {
      _id: transaction.receiver._id,
      firstName: transaction.receiver.firstName,
      lastName: transaction.receiver.lastName,
      username: transaction.receiver.username,
      email: transaction.receiver.email,
      profilePicture: transaction.receiver.profilePicture
    },
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    type: transaction.type,
    description: transaction.description,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt
  });
}

/**
 * Broadcast transaction refund to admin dashboard
 */
function broadcastTransactionRefund(io, refund, originalTransaction) {
  io.to('admin_transactions').emit('transaction:refunded', {
    refund: {
      id: refund._id,
      sender: {
        _id: refund.sender._id,
        firstName: refund.sender.firstName,
        lastName: refund.sender.lastName,
        username: refund.sender.username,
        email: refund.sender.email,
        profilePicture: refund.sender.profilePicture
      },
      receiver: {
        _id: refund.receiver._id,
        firstName: refund.receiver.firstName,
        lastName: refund.receiver.lastName,
        username: refund.receiver.username,
        email: refund.receiver.email,
        profilePicture: refund.receiver.profilePicture
      },
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      type: refund.type,
      description: refund.description,
      createdAt: refund.createdAt,
      updatedAt: refund.updatedAt
    },
    originalTransactionId: originalTransaction._id
  });
}

module.exports = {
  setupSocketHandlers,
  broadcastAdminStatsUpdate,
  broadcastNewUser,
  broadcastFraudAlert,
  broadcastUserStatusUpdate,
  broadcastUsersUpdate,
  broadcastNewTransaction,
  broadcastTransactionUpdate,
  broadcastTransactionRefund
};
