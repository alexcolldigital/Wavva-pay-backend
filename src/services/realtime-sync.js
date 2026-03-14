const logger = require('../utils/logger');

class RealtimeSync {
  constructor(io) {
    this.io = io;
    this.activeConnections = new Map();
  }

  /**
   * Register user connection
   */
  registerConnection(userId, socketId) {
    if (!this.activeConnections.has(userId)) {
      this.activeConnections.set(userId, new Set());
    }
    this.activeConnections.get(userId).add(socketId);
    logger.info(`User ${userId} connected: ${socketId}`);
  }

  /**
   * Remove user connection
   */
  removeConnection(userId, socketId) {
    if (this.activeConnections.has(userId)) {
      this.activeConnections.get(userId).delete(socketId);
      if (this.activeConnections.get(userId).size === 0) {
        this.activeConnections.delete(userId);
      }
    }
  }

  /**
   * Emit real-time wallet update
   */
  emitWalletUpdate(userId, walletData) {
    const sockets = this.activeConnections.get(userId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.io.to(socketId).emit('wallet:update', {
          timestamp: new Date(),
          data: walletData
        });
      });
    }
  }

  /**
   * Emit transaction status update
   */
  emitTransactionUpdate(userId, transactionData) {
    const sockets = this.activeConnections.get(userId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.io.to(socketId).emit('transaction:update', {
          timestamp: new Date(),
          data: transactionData
        });
      });
    }
  }

  /**
   * Emit bank transfer status
   */
  emitBankTransferStatus(userId, transferData) {
    const sockets = this.activeConnections.get(userId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.io.to(socketId).emit('transfer:status', {
          timestamp: new Date(),
          data: transferData
        });
      });
    }
  }

  /**
   * Emit payment received notification
   */
  emitPaymentReceived(userId, paymentData) {
    const sockets = this.activeConnections.get(userId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.io.to(socketId).emit('payment:received', {
          timestamp: new Date(),
          data: paymentData
        });
      });
    }
  }

  /**
   * Emit KYC status update
   */
  emitKYCUpdate(userId, kycData) {
    const sockets = this.activeConnections.get(userId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.io.to(socketId).emit('kyc:update', {
          timestamp: new Date(),
          data: kycData
        });
      });
    }
  }

  /**
   * Broadcast to all connected users (admin notifications)
   */
  broadcastNotification(notification) {
    this.io.emit('notification:broadcast', {
      timestamp: new Date(),
      data: notification
    });
  }

  /**
   * Get active user count
   */
  getActiveUserCount() {
    return this.activeConnections.size;
  }

  /**
   * Get user connection count
   */
  getUserConnectionCount(userId) {
    return this.activeConnections.get(userId)?.size || 0;
  }
}

module.exports = RealtimeSync;
