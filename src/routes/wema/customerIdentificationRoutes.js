// Customer Identification Routes
const express = require('express');
const router = express.Router();
const customerIdentificationController = require('../../controllers/wema/customerIdentificationController');

router.post('/verify-bvn', customerIdentificationController.verifyBVN);
router.post('/verify-nin', customerIdentificationController.verifyNIN);
router.post('/upgrade-kyc', customerIdentificationController.upgradeKYC);
router.get('/profile/:customerId', customerIdentificationController.getProfile);

module.exports = router;