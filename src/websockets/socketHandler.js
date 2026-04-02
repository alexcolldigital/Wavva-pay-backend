/**
 * ====================================================================
 * WebSocket Socket.IO Handler - Comprehensive Real-time System
 * ====================================================================
 * 
 * This file handles all WebSocket connections and real-time events for:
 * - Mobile App Users (real-time updates, wallet, transactions, KYC)
 * - Admin Dashboard (stats, user management, fraud detection)
 * - NFC Transactions and Processing
 * - Split Bills and Group Payments
 * - Group Chat and Support Communication
 * 
 * MERGED HANDLERS (Fixed from original dual-file structure):
 * ✓ User Real-time Handlers (from socketHandler-realtime.js)
 * ✓ Admin Handlers (from socketHandler.js)
 * ✓ Split Bills & Group Payments Handlers
 * ✓ NFC Transaction Handlers
 * 
 * KEY EVENTS:
 * Mobile App:
 *   - user:connect           → authenticate user and start receiving updates
 *   - wallet:request-balance → get current wallet balance
 *   - transactions:request-history → fetch transaction history
 *   - transfer:poll-status   → check transfer/transaction status
 *   - kyc:request-status     → get KYC verification status
 * 
 * Admin:
 *   - admin:subscribe        → subscribe to dashboard stats
 *   - fraud:simulate-alert   → simulate fraud detection alert
 * 
 * NFC:
 *   - nfc:start-reading / nfc:stop-reading
 *   - nfc:process-transaction
 * 
 * ====================================================================
 */

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
  const userRoomMap = new Map(); // Track user -> socket rooms mapping
  
  // Middleware to verify token (optional - allow anonymous connections too)
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        socket.userId = decoded.userId;
        socket.userRole = decoded.role || 'user';
        next();
      } catch (error) {
        logger.warn('Invalid token:', error.message);
        next(new Error('Invalid token'));
      }
    } else {
      // Allow connection without token (for specific events that don't need auth)
      socket.userId = null;
      socket.userRole = 'guest';
      next();
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    const userRole = socket.userRole;

    logger.info(`User connected: ${userId}`, { socketId: socket.id });
    if (userId) {
      userConnections.set(userId, socket.id);
      if (!userRoomMap.has(userId)) {
        userRoomMap.set(userId, new Set());
      }
    }

    /**
     * ========================================
     * MOBILE APP - USER REAL-TIME HANDLERS
     * ========================================
     */

    /**
     * User Authentication and Connection
     */
    socket.on('user:connect', async (data) => {
      const { userId: connectUserId, token } = data;
      
      if (!connectUserId || !token) {
        socket.emit('error', { message: 'Authentication required' });
        return;
      }

      try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        
        // Update socket with user info
        socket.userId = connectUserId;
        
        // Register user connection
        socket.join(`user:${connectUserId}`);
        userConnections.set(connectUserId, socket.id);
        
        const userRoom = `user:${connectUserId}`;
        if (!userRoomMap.has(connectUserId)) {
          userRoomMap.set(connectUserId, new Set());
        }
        const userRooms = userRoomMap.get(connectUserId);
        if (userRooms) {
          userRooms.add(userRoom);
        }

        socket.emit('connected', {
          message: 'Connected to real-time updates',
          userId: connectUserId,
          timestamp: new Date()
        });

        logger.info(`User ${connectUserId} authenticated on socket ${socket.id}`);
      } catch (err) {
        logger.error('User authentication failed:', err.message);
        socket.emit('error', { message: 'Authentication failed' });
      }
    });

    /**
     * Request Wallet Balance
     */
    socket.on('wallet:request-balance', async (data) => {
      const { userId: reqUserId } = data;
      
      try {
        const Wallet = require('../models/Wallet');
        const wallet = await Wallet.findOne({ userId: reqUserId });
        
        if (wallet) {
          socket.emit('wallet:balance', {
            balance: wallet.balance,
            currency: wallet.currency,
            lastUpdated: wallet.lastUpdated,
            timestamp: new Date()
          });
          logger.info(`Wallet balance sent to ${reqUserId}`);
        } else {
          socket.emit('error', { message: 'Wallet not found' });
        }
      } catch (err) {
        logger.error('Error fetching wallet balance:', err.message);
        socket.emit('error', { message: 'Failed to fetch balance' });
      }
    });

    /**
     * Request Transaction History
     */
    socket.on('transactions:request-history', async (data) => {
      const { userId: reqUserId, limit = 10, skip = 0 } = data;
      
      try {
        const Transaction = require('../models/Transaction');
        const transactions = await Transaction.find({ userId: reqUserId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(skip);
        
        socket.emit('transactions:history', {
          transactions,
          count: transactions.length,
          timestamp: new Date()
        });
        logger.info(`Transaction history sent to ${reqUserId}`);
      } catch (err) {
        logger.error('Error fetching transactions:', err.message);
        socket.emit('error', { message: 'Failed to fetch transactions' });
      }
    });

    /**
     * Poll Transfer Status
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
          logger.info(`Transfer status sent for ${reference}`);
        } else {
          socket.emit('error', { message: 'Transfer not found' });
        }
      } catch (err) {
        logger.error('Error polling transfer status:', err.message);
      }
    });

    /**
     * Request KYC Status
     */
    socket.on('kyc:request-status', async (data) => {
      const { userId: reqUserId } = data;
      
      try {
        const UserKYC = require('../models/UserKYC');
        const kyc = await UserKYC.findOne({ userId: reqUserId });
        
        if (kyc) {
          socket.emit('kyc:status', {
            status: kyc.status,
            verificationLevel: kyc.verificationLevel,
            limits: kyc.limits,
            timestamp: new Date()
          });
          logger.info(`KYC status sent to ${reqUserId}`);
        } else {
          socket.emit('error', { message: 'KYC status not found' });
        }
      } catch (err) {
        logger.error('Error fetching KYC status:', err.message);
      }
    });

    /**
     * Subscribe to Payment Request Updates
     */
    socket.on('payment-request:subscribe', (data) => {
      const { paymentRequestId } = data;
      socket.join(`payment-request:${paymentRequestId}`);
      logger.info(`Socket ${socket.id} subscribed to payment request ${paymentRequestId}`);
    });

    /**
     * Subscribe to Settlement Updates
     */
    socket.on('settlement:subscribe', (data) => {
      const { merchantId } = data;
      socket.join(`settlement:${merchantId}`);
      logger.info(`Socket ${socket.id} subscribed to settlement ${merchantId}`);
    });

    /**
     * Logout Event
     */
    socket.on('user:logout', (data) => {
      const { userId: logoutUserId } = data;
      logger.info(`User ${logoutUserId} logged out from socket ${socket.id}`);
      socket.emit('logged_out', { message: 'You have been logged out' });
    });

    /**
     * ========================================
     * SPLIT BILLS & GROUP PAYMENTS
     * ========================================
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
     * ========================================
     * QR PAYMENTS - REAL-TIME HANDLERS
     * ========================================
     */

    /**
     * QR - Generate Payment Token
     */
    socket.on('qr:generate', async (data) => {
      const { amount, currency = 'NGN', description } = data;

      try {
        if (!userId) {
          socket.emit('error', { message: 'Authentication required' });
          return;
        }

        // Generate QR token
        const qrToken = `qr_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Emit to sender (receiver of payment)
        socket.emit('qr:generated', {
          token: qrToken,
          receiverId: userId,
          amount,
          currency,
          description,
          expiresAt: new Date(Date.now() + 15 * 60000), // 15 minutes
          timestamp: new Date()
        });

        // Broadcast QR generation to admin dashboard for stats
        io.to('admin_dashboard').emit('admin:qr-generated', {
          token: qrToken,
          amount,
          currency,
          timestamp: new Date()
        });

        logger.info(`QR token generated`, { userId, amount, currency });
      } catch (error) {
        logger.error('QR generation failed', error);
        socket.emit('error', { message: 'Failed to generate QR' });
      }
    });

    /**
     * QR - Payment Initiated (when QR is scanned)
     */
    socket.on('qr:payment-initiated', async (data) => {
      const { token, senderId, amount, pin } = data;

      try {
        logger.info('QR payment initiated', { token, senderId, amount });

        // Broadcast to receiver that payment was initiated
        io.to(`user:${userId}`).emit('qr:payment-initiated', {
          token,
          senderId,
          amount,
          status: 'initiated',
          timestamp: new Date()
        });

        socket.emit('qr:payment-processing', {
          token,
          message: 'Processing QR payment...',
          timestamp: new Date()
        });

      } catch (error) {
        logger.error('QR payment initiation failed', error);
        socket.emit('qr:payment-failed', {
          error: error.message || 'Payment initiation failed'
        });
      }
    });

    /**
     * QR - Payment Confirmed (payment succeeded)
     */
    socket.on('qr:payment-confirmed', async (data) => {
      const { token, senderId, receiverId, amount, reference } = data;

      try {
        logger.info('QR payment confirmed', { token, senderId, receiverId, amount });

        // Notify both parties
        io.to(`user:${senderId}`).emit('qr:payment-confirmed', {
          token,
          reference,
          amount,
          status: 'completed',
          message: 'Payment successful',
          timestamp: new Date()
        });

        io.to(`user:${receiverId}`).emit('qr:payment-received', {
          token,
          senderId,
          amount,
          reference,
          status: 'completed',
          message: 'You received a payment',
          timestamp: new Date()
        });

        // Broadcast to admin
        io.to('admin_dashboard').emit('admin:qr-payment-completed', {
          token,
          amount,
          reference,
          timestamp: new Date()
        });

        socket.emit('qr:success', {
          message: 'Payment confirmed',
          reference
        });

      } catch (error) {
        logger.error('QR payment confirmation failed', error);
        socket.emit('qr:payment-failed', {
          error: error.message || 'Confirmation failed'
        });
      }
    });

    /**
     * QR - Payment Failed
     */
    socket.on('qr:payment-failed', async (data) => {
      const { token, senderId, amount, reason } = data;

      try {
        logger.info('QR payment failed', { token, senderId, amount, reason });

        // Notify sender
        io.to(`user:${senderId}`).emit('qr:payment-failed', {
          token,
          amount,
          reason,
          message: 'Payment failed',
          timestamp: new Date(),
          canRetry: true
        });

        socket.emit('qr:error', {
          message: 'Payment failed - you can retry',
          reason
        });

      } catch (error) {
        logger.error('QR payment failed notification error', error);
      }
    });

    /**
     * ========================================
     * TAG-BASED TRANSFERS - REAL-TIME HANDLERS
     * ========================================
     */

    /**
     * TAG - Lookup User by Tag
     */
    socket.on('tag:lookup', async (data) => {
      const { tag } = data;

      try {
        if (!tag) {
          socket.emit('error', { message: 'Tag is required' });
          return;
        }

        const User = require('../models/User');
        const targetUser = await User.findOne({ username: tag.replace('#', '').toLowerCase() })
          .select('_id username firstName lastName profilePicture');

        if (targetUser) {
          socket.emit('tag:lookup-success', {
            tag,
            user: targetUser,
            timestamp: new Date()
          });
          logger.info(`Tag lookup successful`, { tag, userId });
        } else {
          socket.emit('tag:lookup-not-found', {
            tag,
            message: 'User not found',
            timestamp: new Date()
          });
        }

      } catch (error) {
        logger.error('Tag lookup failed', error);
        socket.emit('tag:lookup-error', {
          error: error.message || 'Lookup failed'
        });
      }
    });

    /**
     * TAG - Validate Tag Format
     */
    socket.on('tag:validate', async (data) => {
      const { tag } = data;

      try {
        if (!tag) {
          socket.emit('tag:validation-error', {
            message: 'Tag is required'
          });
          return;
        }

        // Tag format validation: alphanumeric, 3-20 chars
        const tagRegex = /^#?[a-zA-Z0-9_]{3,20}$/;
        const isValid = tagRegex.test(tag);

        if (isValid) {
          // Check if tag is available
          const User = require('../models/User');
          const exists = await User.findOne({ 
            username: tag.replace('#', '').toLowerCase() 
          });

          socket.emit('tag:validation-success', {
            tag,
            valid: true,
            available: !exists,
            timestamp: new Date()
          });
        } else {
          socket.emit('tag:validation-error', {
            tag,
            message: 'Invalid tag format (3-20 alphanumeric characters)',
            timestamp: new Date()
          });
        }

      } catch (error) {
        logger.error('Tag validation failed', error);
        socket.emit('tag:validation-error', {
          error: error.message || 'Validation failed'
        });
      }
    });

    /**
     * TAG - Transfer Status
     */
    socket.on('tag:transfer-status', async (data) => {
      const { referenceId } = data;

      try {
        const Transaction = require('../models/Transaction');
        const transaction = await Transaction.findById(referenceId)
          .populate('sender', 'username firstName lastName')
          .populate('receiver', 'username firstName lastName');

        if (transaction) {
          socket.emit('tag:transfer-update', {
            referenceId,
            status: transaction.status,
            amount: transaction.amount,
            sender: transaction.sender,
            receiver: transaction.receiver,
            timestamp: transaction.updatedAt
          });

          logger.info(`Tag transfer status sent`, { referenceId, userId });
        } else {
          socket.emit('error', { message: 'Transfer not found' });
        }

      } catch (error) {
        logger.error('Tag transfer status failed', error);
        socket.emit('error', { message: 'Failed to fetch transfer status' });
      }
    });

    /**
     * ========================================
     * PAYMENT FAILURE & RETRY HANDLING
     * ========================================
     */

    /**
     * PAYMENT - Retry Failed Payment
     */
    socket.on('payment:retry', async (data) => {
      const { transactionId, pin } = data;

      try {
        logger.info('Payment retry initiated', { transactionId, userId });

        const Transaction = require('../models/Transaction');
        const transaction = await Transaction.findById(transactionId);

        if (!transaction) {
          socket.emit('error', { message: 'Transaction not found' });
          return;
        }

        if (transaction.sender.toString() !== userId) {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        // Mark as retrying
        socket.emit('payment:retrying', {
          transactionId,
          message: 'Retrying payment...',
          timestamp: new Date()
        });

        logger.info(`Payment retry in progress`, { transactionId });

      } catch (error) {
        logger.error('Payment retry failed', error);
        socket.emit('payment:retry-error', {
          error: error.message || 'Retry failed'
        });
      }
    });

    /**
     * PAYMENT - Timeout Handler
     */
    socket.on('payment:timeout', async (data) => {
      const { transactionId } = data;

      try {
        logger.warn('Payment timeout', { transactionId, userId });

        socket.emit('payment:timeout-confirmed', {
          transactionId,
          message: 'Payment request timed out',
          timestamp: new Date(),
          canRetry: true
        });

      } catch (error) {
        logger.error('Payment timeout handler failed', error);
      }
    });

    /**
     * ========================================
     * GROUP PAYMENT SETTLEMENT - REAL-TIME
     * ========================================
     */

    /**
     * GROUP - Payment Settled
     */
    socket.on('group_payment:settled', async (data) => {
      const { groupId, totalAmount, distribution } = data;

      try {
        const GroupPayment = require('../models/GroupPayment');
        const group = await GroupPayment.findById(groupId);

        if (!group) {
          socket.emit('error', { message: 'Group not found' });
          return;
        }

        logger.info('Group payment settled', { groupId, totalAmount });

        // Notify all group members about settlement
        io.to(`group_payment:${groupId}`).emit('group_payment:settled', {
          groupId,
          totalAmount,
          distribution,
          message: 'Group payment goal reached and funds distributed',
          timestamp: new Date()
        });

        // Record settlement in group
        group.status = 'settled';
        group.settledAt = new Date();
        await group.save();

      } catch (error) {
        logger.error('Group payment settlement failed', error);
        socket.emit('error', { message: 'Settlement failed' });
      }
    });

    /**
     * GROUP - Payment Distribution
     */
    socket.on('group_payment:distributed', async (data) => {
      const { groupId, memberId, amountReceived } = data;

      try {
        logger.info('Group payment distributed to member', { groupId, memberId, amountReceived });

        // Notify specific member about distribution
        io.to(`user:${memberId}`).emit('group_payment:distributed', {
          groupId,
          amount: amountReceived,
          message: 'You received your share of the group payment',
          timestamp: new Date()
        });

        // Also broadcast to group room for visibility
        io.to(`group_payment:${groupId}`).emit('group_payment:distribution-update', {
          groupId,
          memberId,
          amountReceived,
          timestamp: new Date()
        });

      } catch (error) {
        logger.error('Group payment distribution failed', error);
        socket.emit('error', { message: 'Distribution failed' });
      }
    });

    /**
     * ========================================
     * SPLIT BILL PAYMENT STATUS - REAL-TIME
     * ========================================
     */

    /**
     * SPLIT BILL - Participant Status Update
     */
    socket.on('split_bill:participant_status', async (data) => {
      const { billId, participantId, status } = data;

      try {
        const PaymentRequest = require('../models/PaymentRequest');
        const bill = await PaymentRequest.findById(billId);

        if (!bill) {
          socket.emit('error', { message: 'Bill not found' });
          return;
        }

        logger.info('Split bill participant status updated', { billId, participantId, status });

        // Update participant status in the bill
        const participant = bill.participants.find(p => p.userId.toString() === participantId);
        if (participant) {
          participant.status = status;
          await bill.save();
        }

        // Broadcast status update to all participants
        io.to(`split_bill:${billId}`).emit('split_bill:participant_status', {
          billId,
          participantId,
          status,
          message: `Participant status updated to ${status}`,
          timestamp: new Date()
        });

      } catch (error) {
        logger.error('Split bill participant status update failed', error);
        socket.emit('error', { message: 'Status update failed' });
      }
    });

    /**
     * SPLIT BILL - Payment Received
     */
    socket.on('split_bill:payment_received', async (data) => {
      const { billId, paymentId, participantId, amount } = data;

      try {
        logger.info('Split bill payment received', { billId, participantId, amount });

        const PaymentRequest = require('../models/PaymentRequest');
        const bill = await PaymentRequest.findById(billId);

        if (!bill) {
          socket.emit('error', { message: 'Bill not found' });
          return;
        }

        // Update participant as paid
        const participant = bill.participants.find(p => p.userId.toString() === participantId);
        if (participant) {
          participant.status = 'paid';
          participant.paidAt = new Date();
          await bill.save();
        }

        // Notify bill creator
        io.to(`user:${bill.requestedBy}`).emit('split_bill:payment_received', {
          billId,
          paymentId,
          participantId,
          amount,
          message: 'Payment received for split bill',
          timestamp: new Date()
        });

        // Broadcast to all bill participants
        io.to(`split_bill:${billId}`).emit('split_bill:payment_received', {
          billId,
          participantId,
          amount,
          status: 'paid',
          timestamp: new Date()
        });

        // Check if all participants have paid
        const allPaid = bill.participants.every(p => p.status === 'paid');
        if (allPaid) {
          bill.status = 'completed';
          bill.completedAt = new Date();
          await bill.save();

          io.to(`split_bill:${billId}`).emit('split_bill:completed', {
            billId,
            message: 'All payments received - split bill completed',
            timestamp: new Date()
          });
        }

      } catch (error) {
        logger.error('Split bill payment received failed', error);
        socket.emit('error', { message: 'Payment recording failed' });
      }
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
      if (userId) {
        logger.info(`User disconnected: ${userId}`, { socketId: socket.id });
        
        // Remove from connection map
        userConnections.delete(userId);
        
        // Clean up room map
        if (userRoomMap.has(userId)) {
          userRoomMap.delete(userId);
        }
      } else {
        logger.info(`Guest disconnected: ${socket.id}`);
      }
      
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
  broadcastTransactionRefund,
  broadcastQRPaymentUpdate,
  broadcastTagTransferUpdate,
  broadcastGroupPaymentUpdate,
  broadcastSplitBillUpdate,
  broadcastPaymentFailure,
  broadcastPaymentSuccess
};

/**
 * Broadcast QR payment update
 */
function broadcastQRPaymentUpdate(io, token, status, data) {
  io.to(`qr:${token}`).emit('qr:update', {
    token,
    status,
    ...data,
    timestamp: new Date()
  });
}

/**
 * Broadcast tag transfer update
 */
function broadcastTagTransferUpdate(io, referenceId, status, data) {
  io.to(`tag:${referenceId}`).emit('tag:transfer-update', {
    referenceId,
    status,
    ...data,
    timestamp: new Date()
  });
}

/**
 * Broadcast group payment update
 */
function broadcastGroupPaymentUpdate(io, groupId, status, data) {
  io.to(`group_payment:${groupId}`).emit('group_payments:update', {
    groupId,
    status,
    ...data,
    timestamp: new Date()
  });
}

/**
 * Broadcast split bill update
 */
function broadcastSplitBillUpdate(io, billId, status, data) {
  io.to(`split_bill:${billId}`).emit('splitBills:update', {
    billId,
    status,
    ...data,
    timestamp: new Date()
  });
}

/**
 * Broadcast payment failure to user
 */
function broadcastPaymentFailure(io, userId, error, details) {
  io.to(`user:${userId}`).emit('payment:failed', {
    error,
    details,
    canRetry: true,
    timestamp: new Date()
  });
}

/**
 * Broadcast payment success to user
 */
function broadcastPaymentSuccess(io, userId, reference, amount) {
  io.to(`user:${userId}`).emit('payment:success', {
    reference,
    amount,
    message: 'Payment successful',
    timestamp: new Date()
  });
}
