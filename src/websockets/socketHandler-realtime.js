const logger = require('../utils/logger');
const RealtimeSync = require('../services/realtime-sync');

/**
 * Setup Socket.IO handlers for real-time communication
 */
function setupSocketHandlers(io) {
  const realtimeSync = new RealtimeSync(io);

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    /**
     * User authentication and connection
     */
    socket.on('user:connect', (data) => {
      const { userId, token } = data;
      
      if (!userId || !token) {
        socket.emit('error', { message: 'Authentication required' });
        return;
      }

      // Register user connection
      socket.join(`user:${userId}`);
      realtimeSync.registerConnection(userId, socket.id);

      socket.emit('connected', {
        message: 'Connected to real-time updates',
        userId,
        timestamp: new Date()
      });

      logger.info(`User ${userId} authenticated on socket ${socket.id}`);
    });

    /**
     * Listen for wallet balance requests
     */
    socket.on('wallet:request-balance', async (data) => {
      const { userId } = data;
      
      try {
        const Wallet = require('../models/Wallet');
        const wallet = await Wallet.findOne({ userId });
        
        if (wallet) {
          socket.emit('wallet:balance', {
            balance: wallet.balance,
            currency: wallet.currency,
            lastUpdated: wallet.lastUpdated,
            timestamp: new Date()
          });
        }
      } catch (err) {
        logger.error('Error fetching wallet balance:', err.message);
        socket.emit('error', { message: 'Failed to fetch balance' });
      }
    });

    /**
     * Listen for transaction history requests
     */
    socket.on('transactions:request-history', async (data) => {
      const { userId, limit = 10, skip = 0 } = data;
      
      try {
        const Transaction = require('../models/Transaction');
        const transactions = await Transaction.find({ userId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(skip);
        
        socket.emit('transactions:history', {
          transactions,
          count: transactions.length,
          timestamp: new Date()
        });
      } catch (err) {
        logger.error('Error fetching transactions:', err.message);
        socket.emit('error', { message: 'Failed to fetch transactions' });
      }
    });

    /**
     * Listen for transfer status polling
     */
    socket.on('transfer:poll-status', async (data) => {
      const { transferId, reference } = data;
      
      try {
        const Transaction = require('../models/Transaction');
        const transaction = await Transaction.findOne({
          $or: [{ _id: transferId }, { reference }]
        });
        
        if (transaction) {
          socket.emit('transfer:status-update', {
            reference: transaction.reference,
            status: transaction.status,
            amount: transaction.amount,
            timestamp: new Date()
          });
        }
      } catch (err) {
        logger.error('Error polling transfer status:', err.message);
      }
    });

    /**
     * Listen for KYC status requests
     */
    socket.on('kyc:request-status', async (data) => {
      const { userId } = data;
      
      try {
        const UserKYC = require('../models/UserKYC');
        const kyc = await UserKYC.findOne({ userId });
        
        if (kyc) {
          socket.emit('kyc:status', {
            status: kyc.status,
            verificationLevel: kyc.verificationLevel,
            limits: kyc.limits,
            timestamp: new Date()
          });
        }
      } catch (err) {
        logger.error('Error fetching KYC status:', err.message);
      }
    });

    /**
     * Listen for payment request updates
     */
    socket.on('payment-request:subscribe', (data) => {
      const { paymentRequestId } = data;
      socket.join(`payment-request:${paymentRequestId}`);
      logger.info(`Socket ${socket.id} subscribed to payment request ${paymentRequestId}`);
    });

    /**
     * Listen for merchant settlement updates
     */
    socket.on('settlement:subscribe', (data) => {
      const { merchantId } = data;
      socket.join(`settlement:${merchantId}`);
      logger.info(`Socket ${socket.id} subscribed to settlement ${merchantId}`);
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', () => {
      // Extract userId from socket rooms
      const rooms = Array.from(socket.rooms);
      const userRoom = rooms.find(room => room.startsWith('user:'));
      
      if (userRoom) {
        const userId = userRoom.replace('user:', '');
        realtimeSync.removeConnection(userId, socket.id);
        logger.info(`User ${userId} disconnected from socket ${socket.id}`);
      }
      
      logger.info(`Socket disconnected: ${socket.id}`);
    });

    /**
     * Error handling
     */
    socket.on('error', (error) => {
      logger.error(`Socket error on ${socket.id}:`, error);
    });
  });

  // Return realtimeSync instance for use in webhooks
  return realtimeSync;
}

module.exports = { setupSocketHandlers };
