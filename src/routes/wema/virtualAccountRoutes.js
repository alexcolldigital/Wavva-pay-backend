// Virtual Account Routes
const express = require('express');
const router = express.Router();
const virtualAccountController = require('../../controllers/wema/virtualAccountController');

router.post('/create', virtualAccountController.create);
router.get('/', virtualAccountController.get);
router.get('/transactions', virtualAccountController.getTransactions);
router.post('/webhook', virtualAccountController.webhook);

module.exports = router;