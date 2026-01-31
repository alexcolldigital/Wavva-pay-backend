const express = require('express');
const authMiddleware = require('../middleware/auth');
const combinesController = require('../controllers/combinesController');
const router = express.Router();

// Create a new combine
router.post('/', authMiddleware, combinesController.createCombine);

// Get all combines for user
router.get('/', authMiddleware, combinesController.getCombines);

// Get combine details
router.get('/:combineId', authMiddleware, combinesController.getCombineDetails);

// Add expense with detailed split calculation
router.post('/:combineId/expenses', authMiddleware, combinesController.addExpense);

// Get combine balance breakdown
router.get('/:combineId/balances', authMiddleware, combinesController.getCombineBalances);

// Settle with calculated minimum transactions
router.post('/:combineId/settle-optimized', authMiddleware, combinesController.settleOptimized);

module.exports = router;
