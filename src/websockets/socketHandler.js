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

module.exports = {
  setupSocketHandlers,
  broadcastAdminStatsUpdate,
  broadcastNewUser,
  broadcastFraudAlert
};
