const express = require('express');
const authMiddleware = require('../middleware/auth');
const {
  createSupportTicket,
  getSupportTickets,
  getSupportTicket,
  addSupportResponse,
  getSupportStats
} = require('../controllers/supportController');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Create support ticket
router.post('/', createSupportTicket);

// Get support tickets
router.get('/', getSupportTickets);

// Get support statistics
router.get('/stats', getSupportStats);

// Get specific support ticket
router.get('/:ticketId', getSupportTicket);

// Add response to support ticket
router.post('/:ticketId/response', addSupportResponse);

module.exports = router;