const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const router = express.Router();

// Admin verification middleware
const adminMiddleware = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.userId);
    
    // Check if user is admin (add isAdmin field to User model)
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (err) {
    res.status(403).json({ error: 'Unauthorized' });
  }
};

// Platform statistics routes
router.get('/stats', authMiddleware, adminMiddleware, adminController.getStats);

// User management routes
router.get('/users', authMiddleware, adminMiddleware, adminController.getUsers);
router.post('/users/:userId/suspend', authMiddleware, adminMiddleware, adminController.suspendUser);
router.post('/users/:userId/unsuspend', authMiddleware, adminMiddleware, adminController.unsuspendUser);

// Transaction management routes
router.get('/transactions', authMiddleware, adminMiddleware, adminController.getTransactions);
router.get('/transactions/analytics', authMiddleware, adminMiddleware, adminController.getTransactionAnalytics);
router.post('/transactions/:transactionId/refund', authMiddleware, adminMiddleware, adminController.refundTransaction);

// Security/Monitoring routes
router.get('/fraud-alerts', authMiddleware, adminMiddleware, adminController.getFraudAlerts);

module.exports = router;
