const express = require('express');
const authMiddleware = require('../middleware/auth');
const transactionsController = require('../controllers/transactionsController');
const router = express.Router();

// Get all transactions for user
router.get('/', authMiddleware, transactionsController.getTransactions);

// Get transaction details
router.get('/:transactionId', authMiddleware, transactionsController.getTransactionDetails);

// Get transaction summary
router.get('/summary/stats', authMiddleware, transactionsController.getTransactionSummary);

module.exports = router;
