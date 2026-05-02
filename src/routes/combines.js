const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const Combine = require('../models/Combine');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Expense = require('../models/Expense');
const { calculateSettlements } = require('../utils/splitCalculator');
const { sendCombineInvitation } = require('../services/notifications');
const router = express.Router();

// Create a new combine
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, members, totalAmount, currency = 'NGN' } = req.body;

    if (!name || !members || members.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create combine
    const combine = new Combine({
      name,
      description,
      createdBy: req.userId,
      members: [
        { userId: req.userId, role: 'admin' },
        ...members.map(memberId => ({ userId: memberId, role: 'member' })),
      ],
      totalAmount: totalAmount * 100, // Convert to cents
      currency,
    });

    await combine.save();
    await combine.populate('createdBy members.userId', 'firstName lastName email profilePicture');

    res.status(201).json(combine);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create combine' });
  }
});

// Get all combines for user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const combines = await Combine.find({
      'members.userId': req.userId,
      status: 'active',
    })
      .populate('createdBy', 'firstName lastName profilePicture')
      .populate('members.userId', 'firstName lastName profilePicture email')
      .sort({ createdAt: -1 });

    res.json(combines);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch combines' });
  }
});

// Get combine details
router.get('/:combineId', authMiddleware, async (req, res) => {
  try {
    const combine = await Combine.findById(req.params.combineId)
      .populate('createdBy', 'firstName lastName profilePicture')
      .populate('members.userId', 'firstName lastName profilePicture email')
      .populate('expenses');

    if (!combine) {
      return res.status(404).json({ error: 'Combine not found' });
    }

    // Check if user is member
    const isMember = combine.members.some(m => m.userId._id.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this combine' });
    }

    res.json(combine);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch combine' });
  }
});

// Add expense with detailed split calculation
router.post('/:combineId/expenses', authMiddleware, async (req, res) => {
  try {
    const { description, amount, paidBy, splitAmong } = req.body;
    const combine = await Combine.findById(req.params.combineId);

    if (!combine) {
      return res.status(404).json({ error: 'Combine not found' });
    }

    const userMember = combine.members.find(m => m.userId.equals(req.userId));
    if (userMember.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can add expenses' });
    }

    const amountInCents = amount * 100;
    const splitAmount = Math.floor(amountInCents / splitAmong.length);

    // Create expense record
    const expense = new Expense({
      combineId: combine._id,
      description,
      amount: amountInCents,
      currency: combine.currency,
      paidBy,
      splitAmong,
      splitAmount,
    });

    await expense.save();
    combine.expenses.push(expense._id);
    combine.totalAmount += amountInCents;
    await combine.save();

    res.status(201).json({
      message: 'Expense added',
      expense,
      splitPerPerson: splitAmount / 100,
      newTotal: combine.totalAmount / 100,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

// Get combine balance breakdown
router.get('/:combineId/balances', authMiddleware, async (req, res) => {
  try {
    const combine = await Combine.findById(req.params.combineId)
      .populate('expenses')
      .populate('members.userId', 'firstName lastName');

    if (!combine) {
      return res.status(404).json({ error: 'Combine not found' });
    }

    // Calculate who owes whom
    const balances = {};
    combine.members.forEach(m => {
      balances[m.userId._id.toString()] = 0;
    });

    // Apply expenses to balances
    combine.expenses.forEach(expense => {
      const paidById = expense.paidBy.toString();
      
      // Add to payer's credit
      balances[paidById] = (balances[paidById] || 0) + expense.amount;

      // Subtract from each splitter's balance
      expense.splitAmong.forEach(userId => {
        const userIdStr = userId.toString();
        balances[userIdStr] = (balances[userIdStr] || 0) - expense.splitAmount;
      });
    });

    // Calculate minimum transactions needed
    const settlements = calculateSettlements(balances);

    res.json({
      balances: Object.entries(balances).map(([userId, amount]) => ({
        userId,
        balance: amount / 100,
      })),
      settlements: settlements.map(t => ({
        from: t.from,
        to: t.to,
        amount: (t.amount / 100).toFixed(2),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate balances' });
  }
});

// Settle with calculated minimum transactions
router.post('/:combineId/settle-optimized', authMiddleware, async (req, res) => {
  try {
    const combine = await Combine.findById(req.params.combineId)
      .populate('expenses')
      .populate('members.userId');

    if (!combine) {
      return res.status(404).json({ error: 'Combine not found' });
    }

    const userMember = combine.members.find(m => m.userId._id.equals(req.userId));
    if (userMember.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can settle' });
    }

    // Calculate balances
    const balances = {};
    combine.members.forEach(m => {
      balances[m.userId._id.toString()] = 0;
    });

    combine.expenses.forEach(expense => {
      const paidById = expense.paidBy.toString();
      balances[paidById] = (balances[paidById] || 0) + expense.amount;

      expense.splitAmong.forEach(userId => {
        const userIdStr = userId.toString();
        balances[userIdStr] = (balances[userIdStr] || 0) - expense.splitAmount;
      });
    });

    const settlements = calculateSettlements(balances);
    const transactions = [];

    // Create settlement transactions
    for (const settlement of settlements) {
      const transaction = new Transaction({
        sender: settlement.from,
        receiver: settlement.to,
        amount: settlement.amount,
        currency: combine.currency,
        type: 'combine-split',
        combineId: combine._id,
        status: 'completed',
        description: `Settlement for ${combine.name}`,
      });

      await transaction.save();
      transactions.push(transaction);

      // Update wallets
      const senderWallet = await Wallet.findOne({ userId: settlement.from });
      const receiverWallet = await Wallet.findOne({ userId: settlement.to });

      senderWallet.balance -= settlement.amount;
      receiverWallet.balance += settlement.amount;

      await Promise.all([senderWallet.save(), receiverWallet.save()]);
    }

    combine.settled = true;
    combine.settledAt = new Date();
    combine.status = 'archived';
    await combine.save();

    res.json({
      message: 'Combine settled optimally',
      transactionCount: transactions.length,
      settlements,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Settlement failed' });
  }
});

module.exports = router;
