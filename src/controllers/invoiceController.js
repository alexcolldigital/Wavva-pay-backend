const Invoice = require('../models/Invoice');
const Merchant = require('../models/Merchant');
const MerchantTransaction = require('../models/MerchantTransaction');
const { generateAndUploadInvoice, deleteInvoicePDF } = require('../services/invoiceService');
const { formatCurrency, displayToCents, centsToDisplay } = require('../utils/currencyFormatter');
const axios = require('axios');
const crypto = require('crypto');

// Create Invoice
const createInvoice = async (req, res) => {
  try {
    const userId = req.userId;
    const { transactionId, customerName, customerEmail, customerPhone, customerAddress, items, taxRate = 0, discountAmount = 0, notes, terms, metadata } = req.body;

    // Validation
    if (!customerName || !items || items.length === 0) {
      return res.status(400).json({ error: 'Customer name and line items are required' });
    }

    // Get merchant
    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Validate items
    let subtotal = 0;
    const validatedItems = items.map(item => {
      if (!item.description || !item.quantity || !item.unitPrice) {
        throw new Error('Each item must have description, quantity, and unitPrice');
      }
      const amount = Math.round(item.quantity * item.unitPrice * 100); // Convert to cents
      subtotal += amount;
      return {
        description: item.description,
        quantity: item.quantity,
        unitPrice: Math.round(item.unitPrice * 100), // Convert to cents
        amount
      };
    });

    // Calculate tax
    const taxAmount = Math.round((subtotal * taxRate) / 100);
    const discountAmountInCents = Math.round(discountAmount * 100);
    const totalAmount = subtotal + taxAmount - discountAmountInCents;

    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Total amount must be greater than 0' });
    }

    // Create invoice
    const invoice = new Invoice({
      merchantId: merchant._id,
      transactionId: transactionId || null,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      items: validatedItems,
      subtotal,
      taxRate,
      taxAmount,
      discountAmount: discountAmountInCents,
      totalAmount,
      currency: merchant.settings?.defaultCurrency || 'NGN',
      notes,
      terms,
      metadata: metadata || {}
    });

    await invoice.save();

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      invoice: {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        totalAmount: centsToDisplay(invoice.totalAmount),
        status: invoice.status,
        createdAt: invoice.createdAt
      }
    });
  } catch (err) {
    console.error('Create invoice error:', err);
    res.status(500).json({ error: err.message || 'Failed to create invoice' });
  }
};

// Get Invoice
const getInvoice = async (req, res) => {
  try {
    const userId = req.userId;
    const { invoiceId } = req.params;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const invoice = await Invoice.findOne({
      _id: invoiceId,
      merchantId: merchant._id
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({
      success: true,
      invoice: {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        customerEmail: invoice.customerEmail,
        customerPhone: invoice.customerPhone,
        customerAddress: invoice.customerAddress,
        items: invoice.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: centsToDisplay(item.unitPrice),
          amount: centsToDisplay(item.amount)
        })),
        subtotal: centsToDisplay(invoice.subtotal),
        taxRate: invoice.taxRate,
        taxAmount: centsToDisplay(invoice.taxAmount),
        discountAmount: centsToDisplay(invoice.discountAmount),
        totalAmount: centsToDisplay(invoice.totalAmount),
        currency: invoice.currency,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        pdfUrl: invoice.pdfUrl,
        notes: invoice.notes,
        terms: invoice.terms,
        viewCount: invoice.viewCount,
        viewedAt: invoice.lastViewedAt
      }
    });
  } catch (err) {
    console.error('Get invoice error:', err);
    res.status(500).json({ error: 'Failed to retrieve invoice' });
  }
};

// List Invoices
const listInvoices = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const skip = (page - 1) * limit;
    let query = { merchantId: merchant._id };

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Invoice.countDocuments(query);

    res.json({
      success: true,
      invoices: invoices.map(inv => ({
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        totalAmount: centsToDisplay(inv.totalAmount),
        status: inv.status,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        pdfUrl: inv.pdfUrl
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('List invoices error:', err);
    res.status(500).json({ error: 'Failed to retrieve invoices' });
  }
};

// Generate PDF for Invoice
const generateInvoicePDF = async (req, res) => {
  try {
    const userId = req.userId;
    const { invoiceId } = req.params;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let invoice = await Invoice.findOne({
      _id: invoiceId,
      merchantId: merchant._id
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Delete old PDF if exists
    if (invoice.pdfPublicId) {
      try {
        await deleteInvoicePDF(invoice.pdfPublicId);
      } catch (err) {
        console.warn('Failed to delete old invoice PDF:', err);
      }
    }

    // Generate and upload new PDF
    const uploadResult = await generateAndUploadInvoice(invoice, merchant);

    // Update invoice with PDF details
    invoice.pdfUrl = uploadResult.secure_url;
    invoice.pdfPublicId = uploadResult.public_id;
    await invoice.save();

    res.json({
      success: true,
      message: 'PDF generated successfully',
      pdfUrl: invoice.pdfUrl
    });
  } catch (err) {
    console.error('Generate invoice PDF error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
};

// Send Invoice
const sendInvoice = async (req, res) => {
  try {
    const userId = req.userId;
    const { invoiceId } = req.params;
    const { recipientEmail } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let invoice = await Invoice.findOne({
      _id: invoiceId,
      merchantId: merchant._id
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Generate PDF if not exists
    if (!invoice.pdfUrl) {
      const uploadResult = await generateAndUploadInvoice(invoice, merchant);
      invoice.pdfUrl = uploadResult.secure_url;
      invoice.pdfPublicId = uploadResult.public_id;
      await invoice.save();
    }

    // TODO: Send email with PDF attachment
    // This would integrate with nodemailer or email service

    invoice.sentAt = new Date();
    invoice.status = 'sent';
    await invoice.save();

    res.json({
      success: true,
      message: 'Invoice sent successfully',
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        sentAt: invoice.sentAt,
        sentTo: recipientEmail
      }
    });
  } catch (err) {
    console.error('Send invoice error:', err);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
};

// Update Invoice Status
const updateInvoiceStatus = async (req, res) => {
  try {
    const userId = req.userId;
    const { invoiceId } = req.params;
    const { status } = req.body;

    const validStatuses = ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let invoice = await Invoice.findOne({
      _id: invoiceId,
      merchantId: merchant._id
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const oldStatus = invoice.status;
    invoice.status = status;

    if (status === 'paid') {
      invoice.paidDate = new Date();
    }

    await invoice.save();

    res.json({
      success: true,
      message: `Invoice status updated from ${oldStatus} to ${status}`,
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        updatedAt: invoice.updatedAt
      }
    });
  } catch (err) {
    console.error('Update invoice status error:', err);
    res.status(500).json({ error: 'Failed to update invoice status' });
  }
};

// Delete Invoice
const deleteInvoice = async (req, res) => {
  try {
    const userId = req.userId;
    const { invoiceId } = req.params;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const invoice = await Invoice.findOneAndDelete({
      _id: invoiceId,
      merchantId: merchant._id
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Delete PDF if exists
    if (invoice.pdfPublicId) {
      try {
        await deleteInvoicePDF(invoice.pdfPublicId);
      } catch (err) {
        console.warn('Failed to delete invoice PDF:', err);
      }
    }

    res.json({
      success: true,
      message: 'Invoice deleted successfully'
    });
  } catch (err) {
    console.error('Delete invoice error:', err);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
};

module.exports = {
  createInvoice,
  getInvoice,
  listInvoices,
  generateInvoicePDF,
  sendInvoice,
  updateInvoiceStatus,
  deleteInvoice
};
