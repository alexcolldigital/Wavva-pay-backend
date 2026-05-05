const express = require('express');
const authMiddleware = require('../middleware/auth');
const merchantController = require('../controllers/merchantController');

const router = express.Router();

// Merchant Registration
router.post('/register', authMiddleware, merchantController.registerMerchant);

// Get Merchant Profile
router.get('/profile', authMiddleware, merchantController.getMerchantProfile);

// Update Merchant Profile
router.put('/profile', authMiddleware, merchantController.updateMerchantProfile);

// Settlement Settings
router.put('/settings/settlement', authMiddleware, merchantController.updateSettlementSettings);

// Bank Account Management
router.post('/bank-account', authMiddleware, merchantController.addBankAccount);

// API Keys
router.post('/api-keys/generate', authMiddleware, merchantController.generateAPIKey);
router.get('/api-keys', authMiddleware, merchantController.getAPIKeys);

// Webhook Management
router.put('/webhook', authMiddleware, merchantController.updateWebhookSettings);
router.get('/webhook', authMiddleware, merchantController.getWebhookSettings);
router.post('/webhook/test', authMiddleware, merchantController.testWebhook);

module.exports = router;
