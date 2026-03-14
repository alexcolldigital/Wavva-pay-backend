// Customer Identification Routes
const express = require('express');
const router = express.Router();
const customerIdentificationController = require('../../controllers/wema/customerIdentificationController');

router.post('/verify', customerIdentificationController.verify);

module.exports = router;