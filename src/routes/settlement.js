const express = require('express');
const authMiddleware = require('../middleware/auth');
const settlementController = require('../controllers/settlementController');

const router = express.Router();

// Request Settlement
router.post('/request', authMiddleware, settlementController.requestSettlement);

// Get Settlement History
router.get('/history', authMiddleware, settlementController.getSettlementHistory);

// Get Pending Settlement
router.get('/pending', authMiddleware, settlementController.getPendingSettlement);

// Get Settlement Details
router.get('/:settlementId', authMiddleware, settlementController.getSettlementDetails);

// Cancel Settlement
router.post('/:settlementId/cancel', authMiddleware, settlementController.cancelSettlement);

module.exports = router;
