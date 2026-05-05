const express = require('express');
const authMiddleware = require('../middleware/auth');
const {
  generateReferralCode,
  getReferralStats,
  getReferrals,
  useReferralCode
} = require('../controllers/referralsController');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Generate referral code
router.post('/generate', generateReferralCode);

// Get referral statistics
router.get('/stats', getReferralStats);

// Get referrals list
router.get('/', getReferrals);

// Use referral code (for new users)
router.post('/use', useReferralCode);

module.exports = router;