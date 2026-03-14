// Virtual Account Routes
const express = require('express');
const router = express.Router();
const virtualAccountController = require('../../controllers/wema/virtualAccountController');

router.post('/create', virtualAccountController.create);
router.post('/webhook', virtualAccountController.webhook);

module.exports = router;