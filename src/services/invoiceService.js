const PDFDocument = require('pdfkit');
const cloudinaryService = require('./cloudinary');
const { formatCurrency } = require('../utils/currencyFormatter');
const logger = require('../utils/logger');

/**
 * Generate Invoice PDF
 * @param {Object} invoice - Invoice document with all details
 * @param {Object} merchant - Merchant information
 * @returns {Promise<Buffer>} PDF Buffer
 */
const generateInvoicePDF = async (invoice, merchant) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4'
      });

      let buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      // Header with logo
      if (merchant.logo) {
        // Would need to download logo URL if available
        doc.fontSize(18).font('Helvetica-Bold').text(merchant.businessName, { align: 'left' });
      } else {
        doc.fontSize(18).font('Helvetica-Bold').text(merchant.businessName, { align: 'left' });
      }

      // Merchant info
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(merchant.phone || '', { align: 'left' })
        .text(merchant.email || '', { align: 'left' })
        .text(merchant.website || '', { align: 'left' });

      // Invoice title and number
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('INVOICE', { align: 'center' })
        .moveDown(0.3);

      // Invoice details (right-aligned)
      const detailsX = 350;
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`Invoice #: ${invoice.invoiceNumber}`, detailsX)
        .text(`Date: ${formatDate(invoice.invoiceDate)}`, detailsX)
        .text(`Due Date: ${invoice.dueDate ? formatDate(invoice.dueDate) : 'Not specified'}`, detailsX)
        .text(`Status: ${invoice.status.toUpperCase()}`, detailsX)
        .moveDown(0.5);

      // Customer info
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('BILL TO:', { underline: true })
        .moveDown(0.2);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(invoice.customerName || 'Customer', 50)
        .text(invoice.customerEmail || '', 50)
        .text(invoice.customerPhone || '', 50)
        .text(invoice.customerAddress || '', 50)
        .moveDown(0.5);

      // Line items table
      drawLineItemsTable(doc, invoice);

      // Totals section
      drawTotalsSection(doc, invoice);

      // Notes and terms
      if (invoice.notes) {
        doc
          .moveDown(0.5)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('NOTES:', { underline: true })
          .font('Helvetica')
          .text(invoice.notes);
      }

      if (invoice.terms) {
        doc
          .moveDown(0.5)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('PAYMENT TERMS:', { underline: true })
          .font('Helvetica')
          .text(invoice.terms);
      }

      // Footer
      doc
        .moveDown(1)
        .fontSize(8)
        .font('Helvetica')
        .text('Thank you for your business!', { align: 'center' })
        .text(`Generated on ${new Date().toLocaleDateString()}`, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Draw line items table
 */
const drawLineItemsTable = (doc, invoice) => {
  const tableTop = doc.y;
  const col1 = 50;
  const col2 = 300;
  const col3 = 380;
  const col4 = 450;
  const lineHeight = 30;

  // Table header
  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .text('DESCRIPTION', col1, tableTop, { width: 250 })
    .text('QTY', col2, tableTop, { width: 50, align: 'right' })
    .text('UNIT PRICE', col3, tableTop, { width: 50, align: 'right' })
    .text('AMOUNT', col4, tableTop, { width: 50, align: 'right' });

  // Separator line
  doc.moveTo(50, tableTop + 20).lineTo(550, tableTop + 20).stroke();

  // Line items
  let yPosition = tableTop + 30;
  doc.fontSize(10).font('Helvetica');

  invoice.items.forEach((item, index) => {
    if (yPosition > 650) {
      doc.addPage();
      yPosition = 50;
    }

    const unitPrice = (item.unitPrice / 100).toFixed(2);
    const amount = (item.amount / 100).toFixed(2);

    doc
      .text(item.description, col1, yPosition, { width: 250 })
      .text(item.quantity.toString(), col2, yPosition, { width: 50, align: 'right' })
      .text(`${invoice.currency} ${unitPrice}`, col3, yPosition, { width: 50, align: 'right' })
      .text(`${invoice.currency} ${amount}`, col4, yPosition, { width: 50, align: 'right' });

    yPosition += lineHeight;
  });

  // Final separator
  doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
  doc.y = yPosition + 10;
};

/**
 * Draw totals section
 */
const drawTotalsSection = (doc, invoice) => {
  const rightX = 400;
  const valueX = 480;

  doc
    .fontSize(10)
    .font('Helvetica')
    .moveDown(0.5);

  const subtotal = (invoice.subtotal / 100).toFixed(2);
  const tax = (invoice.taxAmount / 100).toFixed(2);
  const discount = (invoice.discountAmount / 100).toFixed(2);
  const total = (invoice.totalAmount / 100).toFixed(2);

  // Subtotal
  doc.text('Subtotal:', rightX).text(`${invoice.currency} ${subtotal}`, valueX, doc.y - 15, {
    align: 'right'
  });

  // Tax
  if (invoice.taxAmount > 0) {
    doc
      .text(`Tax (${invoice.taxRate}%):`, rightX)
      .text(`${invoice.currency} ${tax}`, valueX, doc.y - 15, { align: 'right' });
  }

  // Discount
  if (invoice.discountAmount > 0) {
    doc
      .text('Discount:', rightX)
      .text(`${invoice.currency} ${discount}`, valueX, doc.y - 15, { align: 'right' });
  }

  // Total
  doc
    .moveDown(0.2)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('TOTAL:', rightX)
    .text(`${invoice.currency} ${total}`, valueX, doc.y - 20, { align: 'right' });
};

/**
 * Format date as readable string
 */
const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

/**
 * Generate and upload invoice PDF to Cloudinary
 * @param {Object} invoice - Invoice document
 * @param {Object} merchant - Merchant information
 * @returns {Promise<Object>} Upload result with secure_url and public_id
 */
const generateAndUploadInvoice = async (invoice, merchant) => {
  try {
    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice, merchant);

    // Upload to Cloudinary
    return new Promise((resolve, reject) => {
      const uploadStream = require('cloudinary').v2.uploader.upload_stream(
        {
          folder: 'wavva-pay/invoices',
          resource_type: 'raw',
          public_id: `INV-${invoice._id}`,
          format: 'pdf',
          tags: ['invoice', invoice.merchantId.toString()]
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              secure_url: result.secure_url,
              public_id: result.public_id,
              uploadedAt: new Date()
            });
          }
        }
      );

      // Stream the buffer
      const streamifier = require('streamifier');
      streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
    });
  } catch (error) {
    logger.error('Invoice generation/upload error:', error);
    throw error;
  }
};

/**
 * Delete invoice PDF
 * @param {String} publicId - Cloudinary public ID
 */
const deleteInvoicePDF = async (publicId) => {
  try {
    return await cloudinaryService.deleteFile(publicId);
  } catch (error) {
    logger.error('Delete invoice PDF error:', error);
    throw error;
  }
};

module.exports = {
  generateInvoicePDF,
  generateAndUploadInvoice,
  deleteInvoicePDF
};
