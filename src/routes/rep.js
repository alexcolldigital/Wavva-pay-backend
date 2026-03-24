const express = require('express');
const router = express.Router();
const repController = require('../controllers/repController');
const authMiddleware = require('../middleware/auth');
const repMiddleware = require('../middleware/repAuth');

// Apply authentication and rep authorization to all routes
router.use(authMiddleware);
router.use(repMiddleware);

// ===== DASHBOARD ROUTES =====
router.get('/dashboard/stats', repController.getDashboardStats);

// ===== CUSTOMER MANAGEMENT ROUTES =====
router.get('/customers', repController.getAssignedCustomers);
router.get('/customers/:customerId', repController.getCustomerDetails);

// ===== TICKET MANAGEMENT ROUTES =====
router.get('/tickets', repController.getTickets);
router.get('/tickets/:ticketId', repController.getTicketDetails);
router.put('/tickets/:ticketId/status', repController.updateTicketStatus);

// ===== ISSUE MANAGEMENT ROUTES =====
router.get('/issues', repController.getIssues);

// ===== REPORTS ROUTES =====
router.get('/reports', repController.getReports);

// ===== EXPORT ROUTES =====
router.get('/customers/export', repController.exportCustomers);
router.get('/tickets/export', repController.exportTickets);
router.get('/issues/export', repController.exportIssues);
router.get('/reports/export', repController.exportReports);

module.exports = router;