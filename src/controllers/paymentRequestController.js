const PaymentRequest = require('../models/PaymentRequest');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const { verifyPayment: onepipeVerifyPayment } = require('../services/onepipe');
const { calculateFee } = require('../utils/feeCalculator');
const { sendPaymentRequestNotification } = require('../services/notifications');
const { recordCommission } = require('../services/commissionService');
const logger = require('../utils/logger');

// Create a payment request for splitting expenses
const createPaymentRequest = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      title,
      description,
      totalAmount,
      currency = 'NGN',
      participants,
      splitType = 'equal',
      dueDate,
      expireDate,
      items = [],
      metadata = {}
    } = req.body;

    // Validation
    if (!title || !totalAmount || !participants || participants.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: title, totalAmount, participants (array)'
      });
    }

    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Total amount must be greater than 0' });
    }

    // Validate split type
    const validSplitTypes = ['equal', 'proportional', 'custom', 'itemized'];
    if (!validSplitTypes.includes(splitType)) {
      return res.status(400).json({ error: 'Invalid split type' });
    }

    // Validate participants
    if (participants.some(p => typeof p === 'string')) {
      // Convert string user IDs to proper participant objects
      const validParticipants = await Promise.all(
        participants.map(async (p) => {
          const user = await User.findById(p);
          if (!user) throw new Error(`User ${p} not found`);
          return { userId: p };
        })
      );
      participants = validParticipants;
    }

    // Ensure initiator is not in participants (to avoid self-payment)
    const participantIds = participants.map(p => p.userId || p);
    if (participantIds.some(id => id.toString() === userId)) {
      return res.status(400).json({ error: 'Cannot include yourself as a participant' });
    }

    // Create payment request
    const paymentRequest = new PaymentRequest({
      title,
      description,
      requestedBy: userId,
      totalAmount: Math.round(totalAmount * 100), // Convert to cents
      currency,
      participants: participants.map(p => ({
        userId: p.userId || p,
        sharePercentage: p.sharePercentage,
        customAmount: p.customAmount ? Math.round(p.customAmount * 100) : undefined,
        itemizedAmount: p.itemizedAmount ? Math.round(p.itemizedAmount * 100) : undefined,
      })),
      splitType,
      dueDate,
      expireDate: expireDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      items: items.map(item => ({
        description: item.description,
        amount: Math.round(item.amount * 100),
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice ? Math.round(item.unitPrice * 100) : Math.round(item.amount * 100),
        assignedTo: item.assignedTo || []
      })),
      metadata
    });

    await paymentRequest.save();
    await paymentRequest.populate('requestedBy', 'firstName lastName email profilePicture');
    await paymentRequest.populate('participants.userId', 'firstName lastName email');

    // Send notifications to participants
    for (const participant of paymentRequest.participants) {
      try {
        await sendPaymentRequestNotification(
          participant.userId,
          userId,
          paymentRequest._id,
          {
            title,
            amount: participant.dueAmount / 100,
            currency
          }
        );
      } catch (notificationError) {
        logger.warn(`Failed to send notification to ${participant.userId}:`, notificationError);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Payment request created successfully',
      data: paymentRequest
    });
  } catch (error) {
    logger.error('Error creating payment request:', error);
    res.status(500).json({ error: error.message || 'Failed to create payment request' });
  }
};

// Get all payment requests (as requester or participant)
const getPaymentRequests = async (req, res) => {
  try {
    const userId = req.userId;
    const { status, role = 'all' } = req.query;

    let query = {};

    if (role === 'requester') {
      query.requestedBy = userId;
    } else if (role === 'participant') {
      query['participants.userId'] = userId;
    } else {
      // Get all (both as requester and participant)
      query = {
        $or: [
          { requestedBy: userId },
          { 'participants.userId': userId }
        ]
      };
    }

    if (status) {
      query.status = status;
    }

    const requests = await PaymentRequest.find(query)
      .populate('requestedBy', 'firstName lastName profilePicture email')
      .populate('participants.userId', 'firstName lastName profilePicture email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    logger.error('Error fetching payment requests:', error);
    res.status(500).json({ error: 'Failed to fetch payment requests' });
  }
};

// Get a specific payment request
const getPaymentRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.userId;

    const request = await PaymentRequest.findById(requestId)
      .populate('requestedBy', 'firstName lastName email profilePicture')
      .populate('participants.userId', 'firstName lastName email profilePicture')
      .populate('transactionIds');

    if (!request) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    // Check if user is requester or participant
    const isRequester = request.requestedBy._id.equals(userId);
    const isParticipant = request.participants.some(p => p.userId._id.equals(userId));

    if (!isRequester && !isParticipant) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    logger.error('Error fetching payment request:', error);
    res.status(500).json({ error: 'Failed to fetch payment request' });
  }
};

// Accept or decline a payment request
const respondToPaymentRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.userId;
    const { action, reason } = req.body; // action: accept or decline

    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Action must be accept or decline' });
    }

    const request = await PaymentRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    const participant = request.participants.find(p => p.userId.equals(userId));
    if (!participant) {
      return res.status(403).json({ error: 'You are not a participant in this request' });
    }

    if (action === 'accept') {
      participant.status = 'accepted';
      request.status = 'active'; // Ensure status is active
    } else if (action === 'decline') {
      participant.status = 'declined';
      participant.declinedAt = new Date();
      participant.declineReason = reason;
      request.totalDeclined = (request.totalDeclined || 0) + participant.dueAmount;
    }

    await request.save();

    res.json({
      success: true,
      message: `Payment request ${action}ed successfully`,
      data: request
    });
  } catch (error) {
    logger.error('Error responding to payment request:', error);
    res.status(500).json({ error: 'Failed to respond to payment request' });
  }
};

// Record payment for a participant
const recordPayment = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.userId;
    const { amount, paymentMethod = 'paystack' } = req.body;

    const request = await PaymentRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    const participant = request.participants.find(p => p.userId.equals(userId));
    if (!participant) {
      return res.status(403).json({ error: 'You are not a participant in this request' });
    }

    const amountInCents = Math.round(amount * 100);

    if (amountInCents > participant.dueAmount) {
      return res.status(400).json({
        error: 'Payment amount exceeds due amount',
        dueAmount: participant.dueAmount / 100
      });
    }

    // Calculate fee for payment request
    const { feeAmount, feePercentage } = calculateFee(amountInCents, request.currency, 'payment_request');
    const totalDebit = amountInCents + feeAmount;

    // Create transaction
    const transaction = new Transaction({
      sender: userId,
      receiver: request.requestedBy,
      amount: amountInCents,
      currency: request.currency,
      feeAmount,
      feePercentage,
      netAmount: amountInCents,
      type: 'combine-split',
      paymentRequestId: requestId,
      description: `Payment for: ${request.title}`,
      method: paymentMethod,
      status: 'completed'
    });

    await transaction.save();

    // Update participant
    participant.paidAmount = (participant.paidAmount || 0) + amountInCents;
    participant.dueAmount -= amountInCents;
    participant.paymentDate = new Date();

    if (participant.dueAmount <= 0) {
      participant.status = 'paid';
    } else {
      participant.status = 'accepted'; // Partially paid
    }

    // Update request totals
    request.totalPaid = (request.totalPaid || 0) + amountInCents;
    request.transactionIds.push(transaction._id);

    // Check if all paid
    const allPaid = request.participants.every(p => p.dueAmount <= 0);
    const anyDeclined = request.participants.some(p => p.status === 'declined');
    
    if (allPaid) {
      request.status = 'fully_paid';
    } else if (request.totalPaid > 0) {
      request.status = 'partially_paid';
    }

    await request.save();

    // Update wallets
    const senderWallet = await Wallet.findOne({ userId });
    const receiverWallet = await Wallet.findOne({ userId: request.requestedBy });

    if (senderWallet) {
      senderWallet.balance -= totalDebit;  // Deduct amount + fee
      await senderWallet.save();
    }

    if (receiverWallet) {
      receiverWallet.balance += amountInCents;  // Receiver gets full amount
      await receiverWallet.save();
    }

    // Record commission to internal ledger
    if (feeAmount > 0) {
      await recordCommission({
        transactionId: transaction._id,
        amount: feeAmount,
        currency: request.currency,
        source: 'payment_request',
        fromUser: userId,
        toUser: request.requestedBy,
        feePercentage,
        grossAmount: amountInCents,
        description: `Payment request commission: ${request.title}`
      });
    }

    res.json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        transaction,
        remainingDue: participant.dueAmount / 100,
        status: request.status
      }
    });
  } catch (error) {
    logger.error('Error recording payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
};

// Create Paystack payment links for all participants
const createPaymentLinks = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.userId;

    const request = await PaymentRequest.findById(requestId)
      .populate('requestedBy')
      .populate('participants.userId');

    if (!request) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    if (!request.requestedBy._id.equals(userId)) {
      return res.status(403).json({ error: 'Only requester can create payment links' });
    }

    const paymentLinks = [];

    for (const participant of request.participants) {
      if (participant.status === 'declined') continue;

      try {
        const amountInKobo = participant.dueAmount; // Already in cents, needs to be in kobo (lowest unit)
        const metadata = {
          paymentRequestId: requestId.toString(),
          participantId: participant.userId._id.toString(),
          type: 'split-payment'
        };

        // Note: This would require actual Paystack integration
        // For now, we're creating the structure
        const link = {
          userId: participant.userId._id,
          participantName: `${participant.userId.firstName} ${participant.userId.lastName}`,
          dueAmount: amountInKobo / 100,
          paymentUrl: `https://checkout.paystack.com/demo` // This would be actual payment link
        };

        request.paymentLinks.push({
          userId: participant.userId._id,
          paymentUrl: link.paymentUrl
        });

        paymentLinks.push(link);
      } catch (error) {
        logger.error(`Failed to create payment link for ${participant.userId._id}:`, error);
      }
    }

    await request.save();

    // Send payment links to participants
    for (const participant of request.participants) {
      if (participant.status !== 'declined') {
        try {
          await sendPaymentRequestNotification(
            participant.userId._id,
            userId,
            requestId,
            {
              title: request.title,
              amount: participant.dueAmount / 100,
              paymentLink: request.paymentLinks.find(pl => pl.userId.equals(participant.userId._id))?.paymentUrl
            }
          );
        } catch (error) {
          logger.warn('Failed to send payment link notification:', error);
        }
      }
    }

    res.json({
      success: true,
      message: 'Payment links created and sent',
      paymentLinks
    });
  } catch (error) {
    logger.error('Error creating payment links:', error);
    res.status(500).json({ error: 'Failed to create payment links' });
  }
};

// Cancel a payment request
const cancelPaymentRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.userId;
    const { reason } = req.body;

    const request = await PaymentRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    if (!request.requestedBy.equals(userId)) {
      return res.status(403).json({ error: 'Only requester can cancel' });
    }

    request.status = 'cancelled';
    request.cancelledAt = new Date();
    request.cancelReason = reason;

    await request.save();

    res.json({
      success: true,
      message: 'Payment request cancelled',
      data: request
    });
  } catch (error) {
    logger.error('Error cancelling payment request:', error);
    res.status(500).json({ error: 'Failed to cancel payment request' });
  }
};

// Get payment request summary/analytics
const getPaymentRequestAnalytics = async (req, res) => {
  try {
    const userId = req.userId;

    const requests = await PaymentRequest.find({
      requestedBy: userId
    });

    const analytics = {
      totalRequests: requests.length,
      totalAmount: 0,
      totalCollected: 0,
      totalPending: 0,
      fullyPaid: 0,
      partiallPaid: 0,
      pending: 0,
      declined: 0,
      cancelled: 0
    };

    requests.forEach(req => {
      analytics.totalAmount += req.totalAmount;
      analytics.totalCollected += req.totalPaid || 0;
      analytics.totalPending += req.totalPending || 0;

      switch (req.status) {
        case 'fully_paid':
          analytics.fullyPaid++;
          break;
        case 'partially_paid':
          analytics.partiallPaid++;
          break;
        case 'cancelled':
          analytics.cancelled++;
          break;
        case 'active':
        case 'draft':
          analytics.pending++;
          break;
      }

      const declined = req.participants.filter(p => p.status === 'declined').length;
      analytics.declined += declined;
    });

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

module.exports = {
  createPaymentRequest,
  getPaymentRequests,
  getPaymentRequest,
  respondToPaymentRequest,
  recordPayment,
  createPaymentLinks,
  cancelPaymentRequest,
  getPaymentRequestAnalytics
};
