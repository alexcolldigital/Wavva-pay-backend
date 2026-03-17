// Settlement Routes
const express = require('express');
const router = express.Router();
const settlementController = require('../../controllers/wema/settlementController');

router.get('/get', settlementController.get);
router.get('/transactions', settlementController.getTransactions);

module.exports = router;