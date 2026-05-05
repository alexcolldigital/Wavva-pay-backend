// Bank List Routes
const express = require('express');
const router = express.Router();
const bankListController = require('../../controllers/wema/bankListController');

router.get('/list', bankListController.list);

module.exports = router;