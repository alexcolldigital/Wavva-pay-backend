// Account Verification Routes
const express = require('express');
const router = express.Router();
const accountVerificationController = require('../../controllers/wema/accountVerificationController');

router.post('/verify', accountVerificationController.verify);

module.exports = router;