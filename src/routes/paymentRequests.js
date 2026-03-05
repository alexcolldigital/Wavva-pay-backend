const express = require('express');
const authMiddleware = require('../middleware/auth');
const paymentRequestController = require('../controllers/paymentRequestController');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Create a new payment request
router.post('/', paymentRequestController.createPaymentRequest);

// Get all payment requests (as requester or participant)
router.get('/', paymentRequestController.getPaymentRequests);

// Get a specific payment request
router.get('/:requestId', paymentRequestController.getPaymentRequest);

// Accept or decline a payment request
router.post('/:requestId/respond', paymentRequestController.respondToPaymentRequest);

// Record a payment
router.post('/:requestId/pay', paymentRequestController.recordPayment);

// Create Paystack payment links
router.post('/:requestId/create-payment-links', paymentRequestController.createPaymentLinks);

// Cancel a payment request
router.post('/:requestId/cancel', paymentRequestController.cancelPaymentRequest);

// Get payment request analytics
router.get('/analytics/summary', paymentRequestController.getPaymentRequestAnalytics);

module.exports = router;
