const PDFDocument = require('pdfkit');
const qrcode = require('qrcode');
const streamifier = require('streamifier');
const moment = require('moment');

class ReceiptService {
  /**
   * Generate a transaction receipt as a PDF buffer
   * @param {Object} transaction - Transaction object with populated sender/receiver
   * @param {Object} user - User requesting the receipt
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async generateTransactionReceipt(transaction, user) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('error', err => reject(err));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Header
        this._addReceiptHeader(doc);

        // Receipt type
        const isDebit = transaction.sender?._id?.toString() === user._id.toString();
        const receiptType = isDebit ? 'DEBIT' : 'CREDIT';
        
        doc.fontSize(16).font('Helvetica-Bold').text(`${receiptType} RECEIPT`, {
          align: 'center',
        });
        
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`Transaction ID: ${transaction._id}`, {
          align: 'center',
        });
        
        doc.fontSize(9).fillColor('#999').text(`Date: ${moment(transaction.createdAt).format('DD MMM YYYY, hh:mm A')}`, {
          align: 'center',
        });
        doc.fillColor('#000');

        doc.moveDown(1);

        // Transaction details box
        this._addReceiptSection(doc, 'Transaction Details', () => {
          const detailsData = [
            ['Transaction Type', this._getTransactionTypeLabel(transaction.type)],
            ['Status', this._getStatusLabel(transaction.status)],
            ['Currency', transaction.currency || 'NGN'],
            ['Reference', `TXN-${transaction._id.toString().slice(-8).toUpperCase()}`],
          ];

          if (transaction.description) {
            detailsData.push(['Description', transaction.description]);
          }

          this._addDetailTable(doc, detailsData);
        });

        doc.moveDown(0.8);

        // Amount section
        this._addReceiptSection(doc, 'Amount Breakdown', () => {
          const amount = transaction.amount / 100; // Convert from cents
          const fee = transaction.feeAmount ? transaction.feeAmount / 100 : 0;
          const netAmount = transaction.netAmount ? transaction.netAmount / 100 : amount - fee;

          const amountData = [
            ['Amount', `${transaction.currency || 'NGN'} ${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ];

          if (fee > 0) {
            amountData.push(['Fee', `-${transaction.currency || 'NGN'} ${fee.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
          }

          amountData.push(['Net Amount', `${transaction.currency || 'NGN'} ${netAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);

          this._addDetailTable(doc, amountData);
        });

        doc.moveDown(0.8);

        // Parties involved
        this._addReceiptSection(doc, 'Transaction Parties', () => {
          const senderName = transaction.sender?.firstName && transaction.sender?.lastName 
            ? `${transaction.sender.firstName} ${transaction.sender.lastName}`
            : transaction.sender?.username || 'N/A';

          const receiverName = transaction.receiver?.firstName && transaction.receiver?.lastName
            ? `${transaction.receiver.firstName} ${transaction.receiver.lastName}`
            : transaction.receiver?.username || 'N/A';

          const partiesData = [
            ['From', senderName],
            ['To', receiverName],
          ];

          if (transaction.receiver?.email) {
            partiesData.push(['Recipient Email', transaction.receiver.email]);
          }

          this._addDetailTable(doc, partiesData);
        });

        doc.moveDown(0.8);

        // QR Code with transaction reference
        await this._addQRCode(doc, `TXN:${transaction._id}:${transaction.reference || 'WAVVAPAY'}`);

        doc.moveDown(1);

        // Footer
        this._addReceiptFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate a bill payment receipt
   * @param {Object} billPayment - Bill payment object
   * @param {Object} user - User requesting receipt
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async generateBillPaymentReceipt(billPayment, user) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('error', err => reject(err));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Header
        this._addReceiptHeader(doc);

        // Receipt type
        doc.fontSize(16).font('Helvetica-Bold').text('BILL PAYMENT RECEIPT', {
          align: 'center',
        });
        
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`Reference: ${billPayment.reference || billPayment._id}`, {
          align: 'center',
        });
        
        doc.fontSize(9).fillColor('#999').text(`Date: ${moment(billPayment.createdAt).format('DD MMM YYYY, hh:mm A')}`, {
          align: 'center',
        });
        doc.fillColor('#000');

        doc.moveDown(1);

        // Bill details
        this._addReceiptSection(doc, 'Bill Information', () => {
          const billData = [
            ['Bill Type', billPayment.billType || 'Utility'],
            ['Provider', billPayment.provider || 'N/A'],
            ['Customer Reference', billPayment.customerReference || 'N/A'],
            ['Status', this._getStatusLabel(billPayment.status)],
          ];

          if (billPayment.serviceNumber) {
            billData.push(['Service Number', billPayment.serviceNumber]);
          }

          this._addDetailTable(doc, billData);
        });

        doc.moveDown(0.8);

        // Amount
        this._addReceiptSection(doc, 'Payment Amount', () => {
          const amount = billPayment.amount / 100;
          const fee = billPayment.fee ? billPayment.fee / 100 : 0;

          const amountData = [
            ['Bill Amount', `${billPayment.currency || 'NGN'} ${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ];

          if (fee > 0) {
            amountData.push(['Processing Fee', `-${billPayment.currency || 'NGN'} ${fee.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
            amountData.push(['Total Paid', `${billPayment.currency || 'NGN'} ${(amount + fee).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
          }

          this._addDetailTable(doc, amountData);
        });

        doc.moveDown(0.8);

        // QR Code
        await this._addQRCode(doc, `BILL:${billPayment._id}:${billPayment.reference || 'WAVVAPAY'}`);

        doc.moveDown(1);

        // Footer
        this._addReceiptFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Helper: Add receipt header with logo/branding
   */
  static _addReceiptHeader(doc) {
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#3B82F6').text('WAVVA PAY', {
      align: 'center',
    });
    
    doc.fontSize(11).fillColor('#666').text('Financial Transaction Receipt', {
      align: 'center',
    });
    
    doc.fontSize(9).fillColor('#999').text('www.wavvapay.com | support@wavvapay.com', {
      align: 'center',
    });

    doc.fillColor('#000');
    doc.moveTo(40, doc.y + 10)
      .lineTo(555, doc.y + 10)
      .stroke('#E5E7EB');

    doc.moveDown(1);
  }

  /**
   * Helper: Add a section with title and content
   */
  static _addReceiptSection(doc, title, contentFn) {
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1F2937').text(title);
    doc.fontSize(10).font('Helvetica').fillColor('#000');
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#E5E7EB');
    doc.moveDown(0.3);

    contentFn();
  }

  /**
   * Helper: Add a detail table
   */
  static _addDetailTable(doc, data) {
    const labelWidth = 150;
    const padding = 8;

    data.forEach(([label, value]) => {
      const startY = doc.y;
      
      // Label
      doc.fontSize(9).fillColor('#666').text(label, {
        width: labelWidth - padding,
        continued: false,
      });

      // Value (on same line)
      doc.fontSize(10).fillColor('#000').text(value, labelWidth, startY, {
        width: 555 - labelWidth,
        align: 'right',
      });

      doc.moveDown(0.5);
    });
  }

  /**
   * Helper: Add QR code
   */
  static async _addQRCode(doc, data) {
    try {
      const qrCodeImage = await qrcode.toDataURL(data, {
        errorCorrectionLevel: 'H',
        width: 150,
      });

      const base64Data = qrCodeImage.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');

      doc.image(buffer, (555 - 100) / 2, doc.y, {
        width: 100,
        height: 100,
        align: 'center',
      });

      doc.moveDown(0.5);
      doc.fontSize(8).fillColor('#999').text('Scan to verify transaction', {
        align: 'center',
      });
      doc.fillColor('#000');
    } catch (error) {
      console.error('Error adding QR code to receipt:', error);
      // Continue without QR code
    }
  }

  /**
   * Helper: Add receipt footer
   */
  static _addReceiptFooter(doc) {
    const footerY = doc.page.height - 60;
    
    doc.moveTo(40, footerY)
      .lineTo(555, footerY)
      .stroke('#E5E7EB');

    doc.fontSize(8).fillColor('#999').text(
      'This is an automated receipt generated by Wavva Pay. Keep this receipt for your records.',
      40,
      footerY + 10,
      {
        align: 'center',
        width: 515,
      }
    );

    doc.fontSize(7).fillColor('#CCC').text(
      `Generated: ${moment().format('YYYY-MM-DD HH:mm:ss')} | Wavva Pay Inc.`,
      40,
      footerY + 35,
      {
        align: 'center',
        width: 515,
      }
    );
  }

  /**
   * Helper: Get transaction type label
   */
  static _getTransactionTypeLabel(type) {
    const typeMap = {
      'peer-to-peer': 'Peer to Peer Transfer',
      'combine-split': 'Combine Split',
      'payout': 'Payout',
      'wallet_funding': 'Wallet Funding',
      'bill_payment': 'Bill Payment',
      'airtime': 'Airtime Purchase',
      'data_bundle': 'Data Bundle',
      'merchant_payment': 'Merchant Payment',
      'group_payment': 'Group Payment',
      'group_contribution': 'Group Contribution',
      'virtual_account_credit': 'Virtual Account Credit',
      'refund': 'Refund',
      'transfer': 'Transfer',
    };
    return typeMap[type] || type;
  }

  /**
   * Helper: Get status label with styling
   */
  static _getStatusLabel(status) {
    const statusMap = {
      'pending': 'Pending',
      'processing': 'Processing',
      'completed': 'Successful',
      'failed': 'Failed',
      'cancelled': 'Cancelled',
    };
    return statusMap[status] || status;
  }

  /**
   * Generate HTML receipt (for email/web viewing)
   */
  static generateHTMLReceipt(transaction, user) {
    const isDebit = transaction.sender?._id?.toString() === user._id.toString();
    const receiptType = isDebit ? 'DEBIT' : 'CREDIT';
    const amount = transaction.amount / 100;
    const fee = transaction.feeAmount ? transaction.feeAmount / 100 : 0;
    const netAmount = transaction.netAmount ? transaction.netAmount / 100 : amount - fee;

    const senderName = transaction.sender?.firstName && transaction.sender?.lastName 
      ? `${transaction.sender.firstName} ${transaction.sender.lastName}`
      : transaction.sender?.username || 'N/A';

    const receiverName = transaction.receiver?.firstName && transaction.receiver?.lastName
      ? `${transaction.receiver.firstName} ${transaction.receiver.lastName}`
      : transaction.receiver?.username || 'N/A';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .header { text-align: center; border-bottom: 2px solid #3B82F6; padding-bottom: 20px; margin-bottom: 20px; }
            .logo { font-size: 28px; font-weight: bold; color: #3B82F6; }
            .receipt-type { font-size: 18px; font-weight: bold; color: #1F2937; margin: 15px 0; }
            .section { margin-bottom: 20px; }
            .section-title { font-size: 12px; font-weight: bold; color: #666; text-transform: uppercase; margin-bottom: 10px; }
            .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E7EB; }
            .detail-label { color: #666; }
            .detail-value { font-weight: 500; color: #1F2937; }
            .amount-highlight { background: #F0F4FF; padding: 15px; border-radius: 6px; }
            .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #E5E7EB; padding-top: 15px; }
            .status-badge { display: inline-block; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
            .status-completed { background: #D1FAE5; color: #065F46; }
            .status-pending { background: #FEF3C7; color: #92400E; }
            .status-failed { background: #FEE2E2; color: #991B1B; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">WAVVA PAY</div>
              <p style="color: #666; margin: 10px 0 0 0;">Financial Transaction Receipt</p>
            </div>

            <div class="receipt-type">${receiptType} RECEIPT</div>
            <p style="text-align: center; color: #999; font-size: 12px;">
              Transaction ID: ${transaction._id}<br/>
              Date: ${moment(transaction.createdAt).format('DD MMM YYYY, hh:mm A')}
            </p>

            <div class="section">
              <div class="section-title">Transaction Details</div>
              <div class="detail-row">
                <span class="detail-label">Transaction Type</span>
                <span class="detail-value">${this._getTransactionTypeLabel(transaction.type)}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Status</span>
                <span class="detail-value">
                  <span class="status-badge status-${transaction.status}">
                    ${this._getStatusLabel(transaction.status)}
                  </span>
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Currency</span>
                <span class="detail-value">${transaction.currency || 'NGN'}</span>
              </div>
              ${transaction.description ? `
              <div class="detail-row">
                <span class="detail-label">Description</span>
                <span class="detail-value">${transaction.description}</span>
              </div>
              ` : ''}
            </div>

            <div class="section amount-highlight">
              <div class="detail-row">
                <span class="detail-label">Amount</span>
                <span class="detail-value">${transaction.currency || 'NGN'} ${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              ${fee > 0 ? `
              <div class="detail-row">
                <span class="detail-label">Fee</span>
                <span class="detail-value">-${transaction.currency || 'NGN'} ${fee.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              ` : ''}
              <div class="detail-row" style="font-weight: bold; border-bottom: 2px solid #3B82F6;">
                <span class="detail-label">Net Amount</span>
                <span class="detail-value">${transaction.currency || 'NGN'} ${netAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Transaction Parties</div>
              <div class="detail-row">
                <span class="detail-label">From</span>
                <span class="detail-value">${senderName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">To</span>
                <span class="detail-value">${receiverName}</span>
              </div>
              ${transaction.receiver?.email ? `
              <div class="detail-row">
                <span class="detail-label">Recipient Email</span>
                <span class="detail-value">${transaction.receiver.email}</span>
              </div>
              ` : ''}
            </div>

            <div class="footer">
              <p>This is an automated receipt generated by Wavva Pay. Keep this receipt for your records.</p>
              <p style="margin-top: 10px; font-size: 10px; color: #CCC;">
                Generated: ${moment().format('YYYY-MM-DD HH:mm:ss')} | Wavva Pay Inc.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

module.exports = ReceiptService;
