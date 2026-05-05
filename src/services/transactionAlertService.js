const nodemailer = require('nodemailer');
const twilio = require('twilio');
const ReceiptService = require('./receiptService');
const moment = require('moment');

const isEmailConfigured = () => {
  return process.env.EMAIL_USER && 
         process.env.EMAIL_PASSWORD && 
         !process.env.EMAIL_USER.includes('your-') &&
         !process.env.EMAIL_PASSWORD.includes('your-');
};

let transporter = null;
if (isEmailConfigured()) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    connectionTimeout: 15000,
    socketTimeout: 15000,
    greetingTimeout: 10000,
    pool: {
      maxConnections: 1,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 5
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && 
    process.env.TWILIO_AUTH_TOKEN && 
    process.env.TWILIO_ACCOUNT_SID.startsWith('AC') &&
    !process.env.TWILIO_ACCOUNT_SID.includes('your-twilio')) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

class TransactionAlertService {
  /**
   * Send transaction alert to user based on preferences
   * @param {Object} transaction - Transaction object with populated sender/receiver
   * @param {Object} user - User who should receive the alert
   * @param {Object} preferences - User notification preferences
   */
  static async sendTransactionAlert(transaction, user, preferences = {}) {
    try {
      const isDebit = transaction.sender?._id?.toString() === user._id.toString();
      const otherParty = isDebit ? transaction.receiver : transaction.sender;
      const alertType = isDebit ? 'DEBIT' : 'CREDIT';

      // Get default preferences if not provided
      const userPrefs = preferences || user.notificationPreferences || {};
      const transactionAlerts = user.transactionAlerts || {};

      // Check if user wants email alerts for this transaction type
      if (userPrefs.email !== false && transactionAlerts.emailTransactionAlerts !== false) {
        await this._sendEmailAlert(transaction, user, otherParty, isDebit, alertType);
      }

      // Check if user wants SMS alerts for this transaction type
      if (userPrefs.sms !== false && transactionAlerts.smsTransactionAlerts !== false && user.phoneNumber) {
        await this._sendSMSAlert(transaction, user, otherParty, isDebit, alertType);
      }

      // Create in-app notification
      if (userPrefs.push !== false) {
        await this._createInAppNotification(transaction, user, otherParty, isDebit, alertType);
      }

      console.log(`✅ Transaction alerts sent for ${transaction._id} to ${user.email}`);
    } catch (error) {
      console.error('Error sending transaction alert:', error);
      throw error;
    }
  }

  /**
   * Send email alert for transaction
   */
  static async _sendEmailAlert(transaction, user, otherParty, isDebit, alertType) {
    try {
      if (!transporter) {
        console.warn('Email transporter not configured');
        return;
      }

      const amount = transaction.amount / 100;
      const currencySymbol = transaction.currency === 'USD' ? '$' : '₦';
      const amountStr = `${currencySymbol}${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      
      const otherPartyName = otherParty?.firstName && otherParty?.lastName 
        ? `${otherParty.firstName} ${otherParty.lastName}`
        : otherParty?.username || 'User';

      const subject = isDebit 
        ? `Money Sent - ${amountStr} to ${otherPartyName}`
        : `Money Received - ${amountStr} from ${otherPartyName}`;

      const htmlContent = this._generateTransactionEmailHTML(
        transaction,
        user,
        otherParty,
        isDebit,
        alertType,
        amountStr
      );

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject,
        html: htmlContent,
      };

      await transporter.sendMail(mailOptions);
      console.log(`📧 Transaction alert email sent to ${user.email}`);
    } catch (error) {
      console.error('Error sending email alert:', error);
      throw error;
    }
  }

  /**
   * Send SMS alert for transaction
   */
  static async _sendSMSAlert(transaction, user, otherParty, isDebit, alertType) {
    try {
      if (!twilioClient) {
        console.warn('Twilio not configured');
        return;
      }

      const amount = transaction.amount / 100;
      const currencySymbol = transaction.currency === 'USD' ? '$' : '₦';
      const amountStr = `${currencySymbol}${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const otherPartyName = otherParty?.firstName && otherParty?.lastName 
        ? `${otherParty.firstName} ${otherParty.lastName}`
        : otherParty?.username || 'User';

      const message = isDebit 
        ? `WAVVA: You sent ${amountStr} to ${otherPartyName}. Ref: ${transaction._id.toString().slice(-8)}`
        : `WAVVA: You received ${amountStr} from ${otherPartyName}. Ref: ${transaction._id.toString().slice(-8)}`;

      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phoneNumber,
      });

      console.log(`📱 Transaction alert SMS sent to ${user.phoneNumber}`);
    } catch (error) {
      console.error('Error sending SMS alert:', error);
      throw error;
    }
  }

  /**
   * Create in-app notification for transaction
   */
  static async _createInAppNotification(transaction, user, otherParty, isDebit, alertType) {
    try {
      const Notification = require('../models/Notification');
      const amount = transaction.amount / 100;
      const currencySymbol = transaction.currency === 'USD' ? '$' : '₦';
      const amountStr = `${currencySymbol}${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const otherPartyName = otherParty?.firstName && otherParty?.lastName 
        ? `${otherParty.firstName} ${otherParty.lastName}`
        : otherParty?.username || 'User';

      const title = isDebit ? 'Money Sent' : 'Money Received';
      const message = isDebit 
        ? `You sent ${amountStr} to ${otherPartyName}`
        : `You received ${amountStr} from ${otherPartyName}`;

      await Notification.createNotification(
        user._id,
        title,
        message,
        'transaction',
        {
          transactionId: transaction._id,
          amount,
          type: isDebit ? 'debit' : 'credit',
        }
      );

      console.log(`🔔 In-app notification created for ${user._id}`);
    } catch (error) {
      console.error('Error creating in-app notification:', error);
      // Don't throw - in-app notification is not critical
    }
  }

  /**
   * Send bill payment alert
   */
  static async sendBillPaymentAlert(billPayment, user, preferences = {}) {
    try {
      const userPrefs = preferences || user.notificationPreferences || {};
      const transactionAlerts = user.transactionAlerts || {};

      const provider = billPayment.provider || 'Bill Provider';
      const amount = billPayment.amount / 100;
      const currencySymbol = billPayment.currency === 'USD' ? '$' : '₦';
      const amountStr = `${currencySymbol}${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const subject = `Bill Payment Successful - ${amountStr} to ${provider}`;
      const message = `Your bill payment of ${amountStr} to ${provider} (Ref: ${billPayment._id.toString().slice(-8)}) has been processed.`;

      // Send email
      if (userPrefs.email !== false && transactionAlerts.emailTransactionAlerts !== false) {
        await this._sendBillPaymentEmail(billPayment, user, subject, amountStr);
      }

      // Send SMS
      if (userPrefs.sms !== false && transactionAlerts.smsTransactionAlerts !== false && user.phoneNumber) {
        await this._sendBillPaymentSMS(billPayment, user, message);
      }

      // Create in-app notification
      if (userPrefs.push !== false) {
        const Notification = require('../models/Notification');
        await Notification.createNotification(
          user._id,
          'Bill Payment Successful',
          message,
          'bill_payment',
          {
            billPaymentId: billPayment._id,
            amount,
            provider,
          }
        );
      }

      console.log(`✅ Bill payment alerts sent for ${billPayment._id} to ${user.email}`);
    } catch (error) {
      console.error('Error sending bill payment alert:', error);
      throw error;
    }
  }

  /**
   * Send bill payment email
   */
  static async _sendBillPaymentEmail(billPayment, user, subject, amountStr) {
    try {
      if (!transporter) {
        console.warn('Email transporter not configured');
        return;
      }

      const htmlContent = this._generateBillPaymentEmailHTML(billPayment, user, amountStr);

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject,
        html: htmlContent,
      };

      await transporter.sendMail(mailOptions);
      console.log(`📧 Bill payment alert email sent to ${user.email}`);
    } catch (error) {
      console.error('Error sending bill payment email:', error);
      throw error;
    }
  }

  /**
   * Send bill payment SMS
   */
  static async _sendBillPaymentSMS(billPayment, user, message) {
    try {
      if (!twilioClient) {
        console.warn('Twilio not configured');
        return;
      }

      const smsMessage = `WAVVA: ${message}`;

      await twilioClient.messages.create({
        body: smsMessage,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phoneNumber,
      });

      console.log(`📱 Bill payment alert SMS sent to ${user.phoneNumber}`);
    } catch (error) {
      console.error('Error sending bill payment SMS:', error);
      throw error;
    }
  }

  /**
   * Generate transaction alert email HTML
   */
  static _generateTransactionEmailHTML(transaction, user, otherParty, isDebit, alertType, amountStr) {
    const otherPartyName = otherParty?.firstName && otherParty?.lastName 
      ? `${otherParty.firstName} ${otherParty.lastName}`
      : otherParty?.username || 'User';

    const reference = `TXN-${transaction._id.toString().slice(-8).toUpperCase()}`;
    const statusBadge = `<span style="background: #D1FAE5; color: #065F46; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;">${this._getStatusLabel(transaction.status)}</span>`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
            .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 20px; }
            .logo { font-size: 24px; font-weight: bold; color: #3B82F6; margin-bottom: 10px; }
            .alert-type { font-size: 18px; font-weight: bold; color: #1F2937; margin: 15px 0; }
            .amount { font-size: 32px; font-weight: bold; color: #3B82F6; text-align: center; margin: 20px 0; }
            .detail { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #E5E7EB; }
            .detail-label { color: #666; }
            .detail-value { font-weight: 500; color: #1F2937; }
            .action-button { display: block; width: 100%; background: #3B82F6; color: white; text-align: center; padding: 12px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 20px; }
            .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #E5E7EB; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">WAVVA PAY</div>
              <p style="color: #999; margin: 5px 0;">Transaction Alert</p>
            </div>

            <div class="alert-type">${isDebit ? 'Money Sent' : 'Money Received'}</div>
            <div class="amount">${amountStr}</div>

            <div>
              <div class="detail">
                <span class="detail-label">${isDebit ? 'Recipient' : 'Sender'}</span>
                <span class="detail-value">${otherPartyName}</span>
              </div>
              <div class="detail">
                <span class="detail-label">Status</span>
                <span class="detail-value">${statusBadge}</span>
              </div>
              <div class="detail">
                <span class="detail-label">Reference</span>
                <span class="detail-value">${reference}</span>
              </div>
              <div class="detail">
                <span class="detail-label">Date & Time</span>
                <span class="detail-value">${moment(transaction.createdAt).format('DD MMM YYYY, hh:mm A')}</span>
              </div>
            </div>

            <a href="${process.env.MOBILE_APP_URL || 'https://wavvapay.com'}/transaction/${transaction._id}" class="action-button">
              View Full Receipt
            </a>

            <div class="footer">
              <p>This is an automated alert from Wavva Pay. If you didn't authorize this transaction, contact us immediately.</p>
              <p style="margin-top: 10px;">© ${new Date().getFullYear()} Wavva Pay Inc.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate bill payment email HTML
   */
  static _generateBillPaymentEmailHTML(billPayment, user, amountStr) {
    const reference = `BILL-${billPayment._id.toString().slice(-8).toUpperCase()}`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
            .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 20px; }
            .logo { font-size: 24px; font-weight: bold; color: #3B82F6; margin-bottom: 10px; }
            .title { font-size: 18px; font-weight: bold; color: #1F2937; margin: 15px 0; }
            .amount { font-size: 32px; font-weight: bold; color: #3B82F6; text-align: center; margin: 20px 0; }
            .detail { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #E5E7EB; }
            .detail-label { color: #666; }
            .detail-value { font-weight: 500; color: #1F2937; }
            .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #E5E7EB; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">WAVVA PAY</div>
              <p style="color: #999; margin: 5px 0;">Bill Payment Alert</p>
            </div>

            <div class="title">Bill Payment Successful</div>
            <div class="amount">${amountStr}</div>

            <div>
              <div class="detail">
                <span class="detail-label">Bill Type</span>
                <span class="detail-value">${billPayment.billType || 'Utility'}</span>
              </div>
              <div class="detail">
                <span class="detail-label">Provider</span>
                <span class="detail-value">${billPayment.provider || 'N/A'}</span>
              </div>
              ${billPayment.serviceNumber ? `
              <div class="detail">
                <span class="detail-label">Service Number</span>
                <span class="detail-value">${billPayment.serviceNumber}</span>
              </div>
              ` : ''}
              <div class="detail">
                <span class="detail-label">Reference</span>
                <span class="detail-value">${reference}</span>
              </div>
              <div class="detail">
                <span class="detail-label">Date & Time</span>
                <span class="detail-value">${moment(billPayment.createdAt).format('DD MMM YYYY, hh:mm A')}</span>
              </div>
            </div>

            <div class="footer">
              <p>This is an automated alert from Wavva Pay. Keep this for your records.</p>
              <p style="margin-top: 10px;">© ${new Date().getFullYear()} Wavva Pay Inc.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Helper: Get status label
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
}

module.exports = TransactionAlertService;
