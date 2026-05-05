// File: backend/src/middleware/kyc-check.js
const kycService = require('../services/kyc-tiers');
const logger = require('../utils/logger');

/**
 * Middleware to check KYC limits before transaction
 */
async function checkKYCLimits(req, res, next) {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount'
      });
    }

    const allowed = await kycService.checkTransactionAllowed(req.user.id, amount);

    if (!allowed.allowed) {
      logger.warn(`Transaction blocked for user ${req.user.id}: ${allowed.reason}`);
      
      return res.status(403).json({
        success: false,
        error: allowed.reason,
        remaining: allowed.remaining,
        limit: allowed.limit
      });
    }

    // Attach allowed info to request
    req.kycAllowed = allowed;
    next();
  } catch (err) {
    logger.error('KYC check error:', err.message);
    res.status(500).json({
      success: false,
      error: 'KYC verification failed'
    });
  }
}

/**
 * Middleware to require minimum KYC tier
 */
function requireKYCTier(minTier) {
  return async (req, res, next) => {
    try {
      const status = await kycService.getKYCStatus(req.user.id);

      const tierLevels = {
        'TIER_0': 0,
        'TIER_1': 1,
        'TIER_2': 2,
        'TIER_3': 3
      };

      const minTierLevel = tierLevels[minTier] || 0;
      const userTierLevel = tierLevels[status.currentTier] || 0;

      if (userTierLevel < minTierLevel) {
        return res.status(403).json({
          success: false,
          error: `This feature requires ${minTier} KYC verification`,
          currentTier: status.currentTier,
          requiredTier: minTier
        });
      }

      next();
    } catch (err) {
      logger.error('KYC tier check error:', err.message);
      res.status(500).json({
        success: false,
        error: 'KYC verification failed'
      });
    }
  };
}

/**
 * Middleware to record transaction after completion
 */
async function recordKYCTransaction(req, res, next) {
  try {
    // Store original json method
    const originalJson = res.json;

    // Override json method
    res.json = function(data) {
      // If transaction was successful, record it
      if (data.success && req.body.amount) {
        kycService.recordTransaction(req.user.id, req.body.amount)
          .catch(err => logger.error('Failed to record transaction:', err.message));
      }

      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  } catch (err) {
    logger.error('Record transaction middleware error:', err.message);
    next();
  }
}

module.exports = {
  checkKYCLimits,
  requireKYCTier,
  recordKYCTransaction
};

// ============================================
// Integration Guide
// ============================================

/*
STEP 1: Add KYC routes to server.js
=====================================

// In src/server.js, add:
app.use('/api/kyc', require('./routes/kyc-tiers'));


STEP 2: Add KYC middleware to payment routes
=============================================

// In src/routes/payments.js:

const { checkKYCLimits, requireKYCTier, recordKYCTransaction } = require('../middleware/kyc-check');

// Send money route
router.post('/send-money', 
  auth, 
  checkKYCLimits,           // Check KYC limits
  recordKYCTransaction,     // Record transaction after success
  async (req, res) => {
    try {
      const { recipientId, amount } = req.body;
      
      // Process payment
      const payment = await paymentService.sendMoney(
        req.user.id, 
        recipientId, 
        amount
      );
      
      res.json({ success: true, data: payment });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Bank transfer route (requires Tier 2)
router.post('/bank-transfer',
  auth,
  requireKYCTier('TIER_2'),  // Require Tier 2
  checkKYCLimits,
  recordKYCTransaction,
  async (req, res) => {
    try {
      const { accountNumber, bankCode, amount } = req.body;
      
      const transfer = await transferService.initiateTransfer(
        req.user.id,
        accountNumber,
        bankCode,
        amount
      );
      
      res.json({ success: true, data: transfer });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Large transfer route (requires Tier 3)
router.post('/large-transfer',
  auth,
  requireKYCTier('TIER_3'),  // Require Tier 3
  checkKYCLimits,
  recordKYCTransaction,
  async (req, res) => {
    try {
      const { accountNumber, bankCode, amount } = req.body;
      
      const transfer = await transferService.initiateTransfer(
        req.user.id,
        accountNumber,
        bankCode,
        amount
      );
      
      res.json({ success: true, data: transfer });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);


STEP 3: Add cron jobs for limit resets
======================================

// In src/server.js or separate cron file:

const cron = require('node-cron');
const kycService = require('./services/kyc-tiers');

// Reset daily limits at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    await kycService.resetDailyLimits();
    logger.info('Daily KYC limits reset');
  } catch (err) {
    logger.error('Failed to reset daily limits:', err.message);
  }
});

// Reset monthly limits on 1st of month
cron.schedule('0 0 1 * *', async () => {
  try {
    await kycService.resetMonthlyLimits();
    logger.info('Monthly KYC limits reset');
  } catch (err) {
    logger.error('Failed to reset monthly limits:', err.message);
  }
});


STEP 4: Add KYC check to wallet operations
==========================================

// In src/routes/wallets.js:

const { checkKYCLimits } = require('../middleware/kyc-check');

// Fund wallet
router.post('/fund',
  auth,
  checkKYCLimits,
  recordKYCTransaction,
  async (req, res) => {
    // Implementation
  }
);

// Withdraw from wallet
router.post('/withdraw',
  auth,
  checkKYCLimits,
  recordKYCTransaction,
  async (req, res) => {
    // Implementation
  }
);


STEP 5: Add KYC check to bill payments
======================================

// In src/routes/bills.js:

const { checkKYCLimits } = require('../middleware/kyc-check');

// Buy airtime
router.post('/airtime/buy',
  auth,
  checkKYCLimits,
  recordKYCTransaction,
  async (req, res) => {
    // Implementation
  }
);

// Pay electricity
router.post('/electricity/pay',
  auth,
  checkKYCLimits,
  recordKYCTransaction,
  async (req, res) => {
    // Implementation
  }
);


STEP 6: Display limits in mobile app
====================================

// In mobile screens:

import { apiService } from '../services/api';

export function WalletScreen() {
  const [limits, setLimits] = useState(null);

  useEffect(() => {
    fetchLimits();
  }, []);

  const fetchLimits = async () => {
    const response = await apiService.get('/kyc/limits');
    setLimits(response.data);
  };

  return (
    <View>
      <Text>Daily Limit: ₦{limits?.limits?.dailyLimit?.toLocaleString()}</Text>
      <Text>Daily Used: ₦{limits?.transactionLimits?.dailyUsed?.toLocaleString()}</Text>
      <Text>Remaining: ₦{(limits?.limits?.dailyLimit - limits?.transactionLimits?.dailyUsed)?.toLocaleString()}</Text>
    </View>
  );
}


STEP 7: Handle limit exceeded errors
====================================

// In mobile error handler:

if (error.status === 403 && error.data?.error?.includes('limit')) {
  Alert.alert(
    'Limit Exceeded',
    error.data.error,
    [
      { text: 'View Limits', onPress: () => navigateTo('KYCProgress') },
      { text: 'OK' }
    ]
  );
}


STEP 8: Add compliance checks
=============================

// In src/services/transaction.js:

async function processTransaction(userId, amount, type) {
  // Check KYC limits
  const allowed = await kycService.checkTransactionAllowed(userId, amount);
  if (!allowed.allowed) throw new Error(allowed.reason);

  // Check fraud
  const fraud = await fraudService.checkTransaction(userId, amount, type);
  if (fraud.flagged) {
    await kycService.flagTransaction(userId, transactionId, fraud.reason);
    throw new Error('Transaction flagged for review');
  }

  // Process transaction
  const transaction = await Transaction.create({
    userId,
    amount,
    type,
    status: 'completed'
  });

  // Record for limits
  await kycService.recordTransaction(userId, amount);

  return transaction;
}
*/
