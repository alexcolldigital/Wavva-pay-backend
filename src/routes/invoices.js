const express = require('express');
const authMiddleware = require('../middleware/auth');
const invoiceController = require('../controllers/invoiceController');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Create Invoice
router.post('/', invoiceController.createInvoice);

// List Invoices
router.get('/', invoiceController.listInvoices);

// Get Invoice
router.get('/:invoiceId', invoiceController.getInvoice);

// Generate Invoice PDF
router.post('/:invoiceId/generate-pdf', invoiceController.generateInvoicePDF);

// Send Invoice
router.post('/:invoiceId/send', invoiceController.sendInvoice);

// Update Invoice Status
router.put('/:invoiceId/status', invoiceController.updateInvoiceStatus);

// Delete Invoice
router.delete('/:invoiceId', invoiceController.deleteInvoice);

module.exports = router;
