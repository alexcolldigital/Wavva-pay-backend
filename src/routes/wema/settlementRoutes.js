// Settlement Routes
const express = require('express');
const router = express.Router();
const settlementController = require('../../controllers/wema/settlementController');

router.get('/get', settlementController.get);

module.exports = router;