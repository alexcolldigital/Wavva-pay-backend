const express = require('express');
const authMiddleware = require('../middleware/auth');
const {
  getAnalytics,
  getWallets,
  getWalletByCurrency,
  createPurposeWallet,
  getWalletsByPurpose,
  getAllWallets,
  addFunds,
  setLimits,
  checkLimits,
} = require('../controllers/walletsController');

const router = express.Router();

// NOTE: Order matters! Specific routes must come before parameter routes
// This prevents /analytics being matched as /:currency='analytics'

// Get all wallets (organized by purpose)
router.get('/all', authMiddleware, getAllWallets);

// Wallet analytics route (specific route before /:currency)
router.get('/analytics', authMiddleware, getAnalytics);

// Create a new wallet with purpose
router.post('/create-purpose-wallet', authMiddleware, createPurposeWallet);

// Get wallets by purpose
router.get('/by-purpose/:purpose', authMiddleware, getWalletsByPurpose);

// Get wallets (main endpoint)
router.get('/', authMiddleware, getWallets);

// Get specific wallet by currency
router.get('/:currency', authMiddleware, getWalletByCurrency);

// Add funds to wallet
router.post('/:currency/add-funds', authMiddleware, addFunds);

// Transaction limits routes
router.put('/limits', authMiddleware, setLimits);
router.post('/check-limits', authMiddleware, checkLimits);

module.exports = router;
