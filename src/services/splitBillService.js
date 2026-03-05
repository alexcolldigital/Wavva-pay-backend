const logger = require('../utils/logger');
const PaymentRequest = require('../models/PaymentRequest');
const Combine = require('../models/Combine');
const Expense = require('../models/Expense');
const Transaction = require('../models/Transaction');

/**
 * Create a payment request from a combine group
 * Useful for settling group expenses where one person paid
 */
const createPaymentRequestFromCombine = async (combineId, requestedBy) => {
  try {
    const combine = await Combine.findById(combineId)
      .populate('members.userId')
      .populate('expenses');

    if (!combine) {
      throw new Error('Combine not found');
    }

    // Calculate total per person
    const totalAmount = combine.totalAmount;
    const participantCount = combine.members.length;
    const amountPerPerson = Math.round(totalAmount / participantCount);

    // Create participants array (exclude requester)
    const participants = combine.members
      .filter(m => !m.userId._id.equals(requestedBy))
      .map(m => ({
        userId: m.userId._id,
        sharePercentage: 100 / participantCount
      }));

    const paymentRequest = new PaymentRequest({
      title: `Payment Request: ${combine.name}`,
      description: `Settle expenses from ${combine.name}`,
      requestedBy,
      totalAmount,
      participants,
      splitType: 'equal',
      combineId,
      status: 'active',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    await paymentRequest.save();
    return paymentRequest;
  } catch (error) {
    logger.error('Error creating payment request from combine:', error);
    throw error;
  }
};

/**
 * Calculate optimal settlement transactions for a group
 * Uses a greedy algorithm to minimize number of transactions
 */
const calculateOptimalSettlement = async (groupId, type = 'combine') => {
  try {
    let expenses = [];
    let members = [];

    if (type === 'combine') {
      const combine = await Combine.findById(groupId)
        .populate('members.userId')
        .populate('expenses');

      if (!combine) {
        throw new Error('Combine not found');
      }

      expenses = combine.expenses;
      members = combine.members.map(m => m.userId._id);
    }

    // Calculate who owes whom
    const balances = {};
    members.forEach(memberId => {
      balances[memberId.toString()] = 0;
    });

    expenses.forEach(expense => {
      const paidById = expense.paidBy.toString();
      balances[paidById] = (balances[paidById] || 0) + expense.amount;

      expense.splitAmong.forEach(userId => {
        const userIdStr = userId.toString();
        balances[userIdStr] = (balances[userIdStr] || 0) - expense.splitAmount;
      });
    });

    // Find settlements needed
    const settlements = [];
    const debtors = Object.entries(balances)
      .filter(([_, amount]) => amount < 0)
      .map(([id, amount]) => ({ id, amount: Math.abs(amount) }))
      .sort((a, b) => b.amount - a.amount);

    const creditors = Object.entries(balances)
      .filter(([_, amount]) => amount > 0)
      .map(([id, amount]) => ({ id, amount }))
      .sort((a, b) => b.amount - a.amount);

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].amount, creditors[j].amount);

      settlements.push({
        from: debtors[i].id,
        to: creditors[j].id,
        amount
      });

      debtors[i].amount -= amount;
      creditors[j].amount -= amount;

      if (debtors[i].amount === 0) i++;
      if (creditors[j].amount === 0) j++;
    }

    return {
      balances,
      settlements,
      transactionCount: settlements.length,
      totalAmount: expenses.reduce((sum, e) => sum + e.amount, 0)
    };
  } catch (error) {
    logger.error('Error calculating optimal settlement:', error);
    throw error;
  }
};

/**
 * Process payments for all participants in a payment request
 */
const processPaymentRequest = async (paymentRequestId, participants) => {
  try {
    const paymentRequest = await PaymentRequest.findById(paymentRequestId);

    if (!paymentRequest) {
      throw new Error('Payment request not found');
    }

    const transactions = [];

    for (const participant of participants) {
      if (participant.dueAmount <= 0 || participant.status === 'declined') {
        continue;
      }

      const transaction = new Transaction({
        sender: participant.userId,
        receiver: paymentRequest.requestedBy,
        amount: participant.dueAmount,
        currency: paymentRequest.currency,
        type: 'combine-split',
        paymentRequestId: paymentRequestId,
        description: `Payment for: ${paymentRequest.title}`,
        method: 'paystack',
        status: 'pending'
      });

      await transaction.save();
      transactions.push(transaction);

      // Update participant
      const participantRecord = paymentRequest.participants.find(
        p => p.userId.equals(participant.userId)
      );
      if (participantRecord) {
        participantRecord.status = 'pending_payment';
      }
    }

    paymentRequest.transactionIds = transactions.map(t => t._id);
    await paymentRequest.save();

    return transactions;
  } catch (error) {
    logger.error('Error processing payment request:', error);
    throw error;
  }
};

/**
 * Calculate split for different scenarios
 */
const calculateSplit = (totalAmount, splitType, participants, customAmounts = {}) => {
  if (participants.length === 0) {
    throw new Error('At least one participant is required');
  }

  const splits = {};
  let remainder = 0;

  switch (splitType) {
    case 'equal':
      const perPerson = Math.floor(totalAmount / participants.length);
      remainder = totalAmount % participants.length;

      participants.forEach((participant, index) => {
        splits[participant] = perPerson + (index < remainder ? 1 : 0);
      });
      break;

    case 'proportional':
      const totalWeight = Object.values(customAmounts).reduce((a, b) => a + b, 0);

      participants.forEach(participant => {
        const weight = customAmounts[participant] || 0;
        const amount = Math.round((weight / totalWeight) * totalAmount);
        splits[participant] = amount;
      });

      // Adjust for rounding
      const splitTotal = Object.values(splits).reduce((a, b) => a + b, 0);
      const diff = totalAmount - splitTotal;
      if (diff !== 0 && participants.length > 0) {
        splits[participants[0]] += diff;
      }
      break;

    case 'custom':
      participants.forEach(participant => {
        splits[participant] = customAmounts[participant] || 0;
      });
      break;

    case 'itemized':
      // For itemized, amounts are pre-assigned to participants
      participants.forEach(participant => {
        splits[participant] = customAmounts[participant] || 0;
      });
      break;

    default:
      throw new Error('Invalid split type');
  }

  return splits;
};

/**
 * Get settlement summary for a group
 */
const getSettlementSummary = async (groupId, type = 'combine') => {
  try {
    const result = await calculateOptimalSettlement(groupId, type);

    return {
      summary: {
        totalExpense: result.totalAmount / 100,
        transactionsNeeded: result.transactionCount,
        settled: false
      },
      balances: Object.entries(result.balances).map(([userId, amount]) => ({
        userId,
        balance: amount / 100,
        owesOrReceives: amount < 0 ? 'owes' : amount > 0 ? 'receives' : 'settled'
      })),
      settlements: result.settlements.map(s => ({
        from: s.from,
        to: s.to,
        amount: s.amount / 100
      }))
    };
  } catch (error) {
    logger.error('Error getting settlement summary:', error);
    throw error;
  }
};

/**
 * Validate a payment request
 */
const validatePaymentRequest = (data) => {
  const errors = [];

  if (!data.title || data.title.trim() === '') {
    errors.push('Title is required');
  }

  if (!data.totalAmount || data.totalAmount <= 0) {
    errors.push('Total amount must be greater than 0');
  }

  if (!data.participants || !Array.isArray(data.participants) || data.participants.length === 0) {
    errors.push('At least one participant is required');
  }

  if (data.splitType && !['equal', 'proportional', 'custom', 'itemized'].includes(data.splitType)) {
    errors.push('Invalid split type');
  }

  if (data.dueDate && new Date(data.dueDate) < new Date()) {
    errors.push('Due date cannot be in the past');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  createPaymentRequestFromCombine,
  calculateOptimalSettlement,
  processPaymentRequest,
  calculateSplit,
  getSettlementSummary,
  validatePaymentRequest
};
