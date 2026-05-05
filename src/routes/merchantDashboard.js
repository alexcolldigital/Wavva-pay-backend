const express = require('express');
const authMiddleware = require('../middleware/auth');
const merchantDashboardController = require('../controllers/merchantDashboardController');

const router = express.Router();

// Dashboard Summary
router.get('/summary', authMiddleware, merchantDashboardController.getDashboardSummary);

// Transactions History
router.get('/transactions', authMiddleware, merchantDashboardController.getTransactions);

// Sales Analytics
router.get('/analytics', authMiddleware, merchantDashboardController.getSalesAnalytics);

module.exports = router;
