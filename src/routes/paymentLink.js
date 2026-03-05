const express = require('express');
const authMiddleware = require('../middleware/auth');
const paymentLinkController = require('../controllers/paymentLinkController');

const router = express.Router();

// Create Payment Link (Auth Required)
router.post('/', authMiddleware, paymentLinkController.createPaymentLink);

// Get All Payment Links (Auth Required)
router.get('/', authMiddleware, paymentLinkController.getPaymentLinks);

// Get Payment Link Details (Auth Required)
router.get('/:linkId', authMiddleware, paymentLinkController.getPaymentLinkDetails);

// Update Payment Link (Auth Required)
router.put('/:linkId', authMiddleware, paymentLinkController.updatePaymentLink);

// Delete Payment Link (Auth Required)
router.delete('/:linkId', authMiddleware, paymentLinkController.deletePaymentLink);

// ===== PUBLIC ROUTES (No Auth Required) =====

// View Payment Link Public (Get payment form data by slug)
router.get('/public/:slug', paymentLinkController.viewPaymentLinkPublic);

// Checkout - Customer processes payment on payment link
router.post('/:linkId/checkout', paymentLinkController.checkoutPaymentLink);

// Verify Payment - Webhook from Paystack
router.post('/:linkId/verify', paymentLinkController.verifyPaymentLink);

module.exports = router;
