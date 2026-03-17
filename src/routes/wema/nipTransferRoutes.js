// NIP Transfer Routes
const express = require('express');
const router = express.Router();
const nipTransferController = require('../../controllers/wema/nipTransferController');

router.post('/send', nipTransferController.send);
router.get('/status/:transactionReference', nipTransferController.getStatus);

module.exports = router;