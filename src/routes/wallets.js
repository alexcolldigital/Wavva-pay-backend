const express = require('express');
const authMiddleware = require('../middleware/auth');
const {
  getAnalytics,
  getWallets,
  getWalletByCurrency,
  addFunds,
  setLimits,
  checkLimits,
} = require('../controllers/walletsController');

const router = express.Router();

// NOTE: Order matters! Specific routes must come before parameter routes
// This prevents /analytics being matched as /:currency='analytics'

// Wallet analytics route (specific route before /:currency)
router.get('/analytics', authMiddleware, getAnalytics);

// Get wallets
router.get('/', authMiddleware, getWallets);

// Get specific wallet by currency
router.get('/:currency', authMiddleware, getWalletByCurrency);

// Add funds to wallet
router.post('/:currency/add-funds', authMiddleware, addFunds);

// Transaction limits routes
router.put('/limits', authMiddleware, setLimits);
router.post('/check-limits', authMiddleware, checkLimits);

module.exports = router;
