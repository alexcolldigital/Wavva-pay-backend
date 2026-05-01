const ReceiptService = require('../services/receiptService');
const TransactionAlertService = require('../services/transactionAlertService');
const Transaction = require('../models/Transaction');
const BillPayment = require('../models/BillPayment');
const User = require('../models/User');

/**
 * Generate and download transaction receipt
 */
const downloadTransactionReceipt = async (req, res) => {
  try {
    const { transactionId, format = 'pdf' } = req.params;
    const userId = req.userId;

    // Fetch transaction
    const transaction = await Transaction.findById(transactionId)
      .populate('sender', 'firstName lastName email profilePicture username')
      .populate('receiver', 'firstName lastName email profilePicture username');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Check if user is involved in the transaction
    const isInvolved = 
      transaction.sender._id.toString() === userId ||
      (transaction.receiver && transaction.receiver._id.toString() === userId);

    if (!isInvolved) {
      return res.status(403).json({ error: 'Unauthorized to access this receipt' });
    }

    const user = await User.findById(userId);

    if (format === 'pdf') {
      // Generate PDF receipt
      const pdfBuffer = await ReceiptService.generateTransactionReceipt(transaction, user);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Receipt-${transaction._id}.pdf"`
      );
      res.send(pdfBuffer);
    } else if (format === 'html') {
      // Generate HTML receipt
      const htmlContent = ReceiptService.generateHTMLReceipt(transaction, user);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(htmlContent);
    } else {
      return res.status(400).json({ error: 'Invalid format. Use pdf or html' });
    }
  } catch (error) {
    console.error('Download receipt error:', error);
    res.status(500).json({ error: 'Failed to generate receipt' });
  }
};

/**
 * Get shareable receipt link and details
 */
const getReceiptDetails = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.userId;

    // Fetch transaction
    const transaction = await Transaction.findById(transactionId)
      .populate('sender', 'firstName lastName email profilePicture username')
      .populate('receiver', 'firstName lastName email profilePicture username');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Check if user is involved in the transaction
    const isInvolved = 
      transaction.sender._id.toString() === userId ||
      (transaction.receiver && transaction.receiver._id.toString() === userId);

    if (!isInvolved) {
      return res.status(403).json({ error: 'Unauthorized to access this receipt' });
    }

    const senderName = transaction.sender?.firstName && transaction.sender?.lastName 
      ? `${transaction.sender.firstName} ${transaction.sender.lastName}`
      : transaction.sender?.username || 'N/A';

    const receiverName = transaction.receiver?.firstName && transaction.receiver?.lastName
      ? `${transaction.receiver.firstName} ${transaction.receiver.lastName}`
      : transaction.receiver?.username || 'N/A';

    const amount = transaction.amount / 100;
    const fee = transaction.feeAmount ? transaction.feeAmount / 100 : 0;
    const netAmount = transaction.netAmount ? transaction.netAmount / 100 : amount - fee;

    res.json({
      success: true,
      receipt: {
        id: transaction._id,
        transactionId: `TXN-${transaction._id.toString().slice(-8).toUpperCase()}`,
        type: transaction.type,
        status: transaction.status,
        amount: {
          gross: amount,
          fee,
          net: netAmount,
          currency: transaction.currency || 'NGN',
        },
        parties: {
          sender: {
            name: senderName,
            email: transaction.sender?.email,
          },
          receiver: transaction.receiver ? {
            name: receiverName,
            email: transaction.receiver?.email,
          } : null,
        },
        date: transaction.createdAt,
        description: transaction.description,
        downloadLinks: {
          pdf: `/api/receipts/transactions/${transactionId}/download/pdf`,
          html: `/api/receipts/transactions/${transactionId}/download/html`,
        },
        shareLinks: {
          email: `mailto:?subject=Transaction Receipt&body=Check your receipt: ${process.env.FRONTEND_URL}/receipt/${transactionId}`,
          whatsapp: `https://wa.me/?text=My Wavva Pay receipt: ${process.env.FRONTEND_URL}/receipt/${transactionId}`,
        }
      }
    });
  } catch (error) {
    console.error('Get receipt details error:', error);
    res.status(500).json({ error: 'Failed to fetch receipt details' });
  }
};

/**
 * Download bill payment receipt
 */
const downloadBillPaymentReceipt = async (req, res) => {
  try {
    const { billPaymentId, format = 'pdf' } = req.params;
    const userId = req.userId;

    // Fetch bill payment
    const billPayment = await BillPayment.findById(billPaymentId)
      .populate('user', 'firstName lastName email username');

    if (!billPayment) {
      return res.status(404).json({ error: 'Bill payment not found' });
    }

    // Check if user is the one who paid
    if (billPayment.user._id.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized to access this receipt' });
    }

    const user = await User.findById(userId);

    if (format === 'pdf') {
      // Generate PDF receipt
      const pdfBuffer = await ReceiptService.generateBillPaymentReceipt(billPayment, user);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Bill-Receipt-${billPayment._id}.pdf"`
      );
      res.send(pdfBuffer);
    } else if (format === 'html') {
      // Generate HTML receipt (you can create a similar method in ReceiptService)
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
              .header { text-align: center; border-bottom: 2px solid #3B82F6; padding-bottom: 20px; margin-bottom: 20px; }
              .logo { font-size: 28px; font-weight: bold; color: #3B82F6; }
              .section { margin-bottom: 20px; }
              .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E7EB; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo">WAVVA PAY</div>
                <p>Bill Payment Receipt</p>
              </div>
              <div class="section">
                <div class="detail-row"><span>Bill Type:</span> <span>${billPayment.billType}</span></div>
                <div class="detail-row"><span>Provider:</span> <span>${billPayment.provider}</span></div>
                <div class="detail-row"><span>Amount:</span> <span>${(billPayment.amount / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${billPayment.currency}</span></div>
                <div class="detail-row"><span>Status:</span> <span>${billPayment.status}</span></div>
              </div>
            </div>
          </body>
        </html>
      `;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(htmlContent);
    } else {
      return res.status(400).json({ error: 'Invalid format. Use pdf or html' });
    }
  } catch (error) {
    console.error('Download bill payment receipt error:', error);
    res.status(500).json({ error: 'Failed to generate bill payment receipt' });
  }
};

/**
 * Resend transaction receipt and alerts
 */
const resendTransactionReceipt = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { method = 'email' } = req.body;
    const userId = req.userId;

    // Fetch transaction
    const transaction = await Transaction.findById(transactionId)
      .populate('sender', 'firstName lastName email phoneNumber username')
      .populate('receiver', 'firstName lastName email phoneNumber username');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Check if user is involved
    const isInvolved = 
      transaction.sender._id.toString() === userId ||
      (transaction.receiver && transaction.receiver._id.toString() === userId);

    if (!isInvolved) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(userId);

    // Send alert based on method
    if (method === 'email') {
      // Generate and send receipt email
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });

      const pdfBuffer = await ReceiptService.generateTransactionReceipt(transaction, user);
      const htmlReceipt = ReceiptService.generateHTMLReceipt(transaction, user);

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: `Transaction Receipt - ${transaction._id.toString().slice(-8)}`,
        html: htmlReceipt,
        attachments: [
          {
            filename: `Receipt-${transaction._id}.pdf`,
            content: pdfBuffer,
          }
        ]
      };

      await transporter.sendMail(mailOptions);
      res.json({ success: true, message: 'Receipt sent to email' });
    } else if (method === 'sms') {
      // Send SMS alert
      const twilio = require('twilio');
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      const amount = transaction.amount / 100;
      const message = `WAVVA: Your receipt for transaction ${transaction._id.toString().slice(-8)} is ready. View at ${process.env.FRONTEND_URL}/receipt/${transaction._id}`;

      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phoneNumber,
      });

      res.json({ success: true, message: 'Receipt sent to SMS' });
    } else {
      return res.status(400).json({ error: 'Invalid method. Use email or sms' });
    }
  } catch (error) {
    console.error('Resend receipt error:', error);
    res.status(500).json({ error: 'Failed to resend receipt' });
  }
};

/**
 * Get user transaction alert preferences
 */
const getTransactionAlertPreferences = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId).select('transactionAlerts notificationPreferences');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      preferences: {
        ...user.transactionAlerts,
        globalNotifications: user.notificationPreferences,
      }
    });
  } catch (error) {
    console.error('Get transaction alert preferences error:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
};

/**
 * Update user transaction alert preferences
 */
const updateTransactionAlertPreferences = async (req, res) => {
  try {
    const userId = req.userId;
    const preferences = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        transactionAlerts: {
          emailTransactionAlerts: preferences.emailTransactionAlerts !== undefined ? preferences.emailTransactionAlerts : true,
          smsTransactionAlerts: preferences.smsTransactionAlerts !== undefined ? preferences.smsTransactionAlerts : true,
          emailOnDebit: preferences.emailOnDebit !== undefined ? preferences.emailOnDebit : true,
          emailOnCredit: preferences.emailOnCredit !== undefined ? preferences.emailOnCredit : true,
          smsOnDebit: preferences.smsOnDebit !== undefined ? preferences.smsOnDebit : true,
          smsOnCredit: preferences.smsOnCredit !== undefined ? preferences.smsOnCredit : true,
          billPaymentAlerts: preferences.billPaymentAlerts !== undefined ? preferences.billPaymentAlerts : true,
          minimumAlertAmount: preferences.minimumAlertAmount !== undefined ? preferences.minimumAlertAmount : 0,
        }
      },
      { new: true }
    ).select('transactionAlerts');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      preferences: user.transactionAlerts,
      message: 'Transaction alert preferences updated successfully'
    });
  } catch (error) {
    console.error('Update transaction alert preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
};

module.exports = {
  downloadTransactionReceipt,
  getReceiptDetails,
  downloadBillPaymentReceipt,
  resendTransactionReceipt,
  getTransactionAlertPreferences,
  updateTransactionAlertPreferences,
};
