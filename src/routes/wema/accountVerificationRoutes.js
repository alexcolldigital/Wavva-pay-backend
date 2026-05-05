// Account Verification Routes
const express = require('express');
const router = express.Router();
const accountVerificationController = require('../../controllers/wema/accountVerificationController');

router.post('/verify', accountVerificationController.verify);
router.post('/verify-identity', accountVerificationController.verifyIdentity);

module.exports = router;