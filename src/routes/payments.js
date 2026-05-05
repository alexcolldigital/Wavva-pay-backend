const express = require('express');
const authMiddleware = require('../middleware/auth');
const paymentsController = require('../controllers/paymentsController');
const router = express.Router();

// P2P Transfers
router.post('/send', authMiddleware, paymentsController.sendMoney);
router.post('/send-nfc', authMiddleware, paymentsController.sendMoneyViaNFC);
router.get('/lookup/:identifier', authMiddleware, paymentsController.lookupUser);
router.get('/transaction-status/:transactionId', authMiddleware, paymentsController.getTransactionStatus);

// Wallet Transfers (between user's own wallets)
router.post('/transfer-between-wallets', authMiddleware, paymentsController.transferBetweenWallets);

// Wallet Funding (Paystack)
router.post('/fund/initialize', authMiddleware, paymentsController.initializeFunding);
router.post('/fund/verify', authMiddleware, paymentsController.verifyFunding);

// Bank Transfers
router.get('/banks', authMiddleware, paymentsController.getBanks);
router.post('/resolve-account', authMiddleware, paymentsController.resolveAccount);
router.post('/bank-transfer', authMiddleware, paymentsController.initiateTransfer);
router.get('/bank-transfer/:transferId', authMiddleware, paymentsController.getTransferStatus);

// QR Code Payments
router.post('/generate-qr-token', authMiddleware, paymentsController.generateQrToken);
router.post('/verify-qr-token', authMiddleware, paymentsController.verifyQrToken);

// Bill Payments & Utilities
router.post('/bill/pay', authMiddleware, paymentsController.payBill);
router.get('/bill/providers', authMiddleware, paymentsController.getBillProviders);

// Airtime & Data
router.post('/airtime/buy', authMiddleware, paymentsController.buyAirtime);
router.post('/data/buy', authMiddleware, paymentsController.buyDataBundle);
router.get('/data/plans', authMiddleware, paymentsController.getDataPlans);

// Payment Requests
router.post('/accept-payment-request', authMiddleware, paymentsController.acceptPaymentRequest);
router.post('/reject-payment-request', authMiddleware, paymentsController.rejectPaymentRequest);
router.get('/pending-requests', authMiddleware, paymentsController.getPendingRequests);
router.post('/request-payment', authMiddleware, paymentsController.requestPayment);

module.exports = router;
