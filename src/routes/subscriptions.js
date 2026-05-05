const express = require('express');
const authMiddleware = require('../middleware/auth');
const subscriptionController = require('../controllers/subscriptionController');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Get Subscription Analytics (must come before parameterized routes)
router.get('/analytics/overview', subscriptionController.getSubscriptionAnalytics);

// Create Subscription
router.post('/', subscriptionController.createSubscription);

// List Subscriptions
router.get('/', subscriptionController.listSubscriptions);

// Get Subscription
router.get('/:subscriptionId', subscriptionController.getSubscription);

// Update Subscription
router.put('/:subscriptionId', subscriptionController.updateSubscription);

// Pause Subscription
router.post('/:subscriptionId/pause', subscriptionController.pauseSubscription);

// Resume Subscription
router.post('/:subscriptionId/resume', subscriptionController.resumeSubscription);

// Cancel Subscription
router.post('/:subscriptionId/cancel', subscriptionController.cancelSubscription);

module.exports = router;
