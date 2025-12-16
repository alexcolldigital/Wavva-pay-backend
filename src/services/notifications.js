const nodemailer = require('nodemailer');
const twilio = require('twilio');
const crypto = require('crypto');

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Twilio configuration
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && 
    process.env.TWILIO_AUTH_TOKEN && 
    process.env.TWILIO_ACCOUNT_SID.startsWith('AC') &&
    !process.env.TWILIO_ACCOUNT_SID.includes('your-twilio')) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Email templates
const emailTemplates = {
  verification: (verificationLink) => `
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #000; color: #fff;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #39FF14;">🦑 Welcome to Wavva Pay</h2>
          <p>We are Venom. Verify your email to unleash the power of symbiotic payments.</p>
          <a href="${verificationLink}" style="background-color: #39FF14; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; margin: 20px 0;">
            Verify Email
          </a>
          <p style="color: #999; font-size: 12px;">Link expires in 24 hours.</p>
        </div>
      </body>
    </html>
  `,
  
  paymentConfirmation: (sender, receiver, amount, currency, transactionId) => `
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #000; color: #fff;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #39FF14;">💰 Payment Confirmed</h2>
          <p>You sent <strong>${amount} ${currency}</strong> to <strong>${receiver.firstName} ${receiver.lastName}</strong></p>
          <div style="background-color: #1a1a1a; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #39FF14;">
            <p><strong>Transaction ID:</strong></p>
            <p style="word-break: break-all; font-family: monospace; font-size: 12px;">${transactionId}</p>
          </div>
          <p style="color: #39FF14; font-weight: bold;">We are Venom. Together, we are stronger.</p>
        </div>
      </body>
    </html>
  `,

  combineInvitation: (combiner, combineName, amount) => `
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #000; color: #fff;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #39FF14;">⚡ You've Been Added to a Combine</h2>
          <p><strong>${combiner}</strong> added you to <strong>${combineName}</strong></p>
          <p>Total to settle: <strong>${amount}</strong></p>
          <p style="color: #39FF14; font-weight: bold;">We are Venom. Together, we are stronger.</p>
        </div>
      </body>
    </html>
  `,
};

// Send email verification
const sendEmailVerification = async (user) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = token;
    await user.save();

    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?userId=${user._id}&token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: '🦑 Wavva Pay - Verify Your Email',
      html: emailTemplates.verification(verificationLink),
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error('Email send error:', err);
    return false;
  }
};

// Send OTP via SMS/WhatsApp
const sendOTP = async (user) => {
  try {
    if (!twilioClient) {
      console.warn('Twilio not configured - OTP sending disabled');
      return false;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.phoneVerificationOTP = otp;
    user.phoneVerificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Try WhatsApp first, fallback to SMS
    try {
      await twilioClient.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${user.phone}`,
        body: `🦑 Your Wavva Pay verification code: ${otp}\n\nValid for 10 minutes.`,
      });
    } catch (whatsappErr) {
      // Fallback to SMS
      await twilioClient.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phone,
        body: `🦑 Your Wavva Pay verification code: ${otp}. Valid for 10 minutes.`,
      });
    }

    return true;
  } catch (err) {
    console.error('OTP send error:', err);
    return false;
  }
};

// Send payment confirmation
const sendPaymentConfirmation = async (sender, receiver, amount, currency, transactionId) => {
  try {
    const senderEmail = {
      from: process.env.EMAIL_USER,
      to: sender.email,
      subject: '💰 Payment Confirmed - Wavva Pay',
      html: emailTemplates.paymentConfirmation(sender, receiver, amount, currency, transactionId),
    };

    const receiverEmail = {
      from: process.env.EMAIL_USER,
      to: receiver.email,
      subject: '💰 Payment Received - Wavva Pay',
      html: emailTemplates.paymentConfirmation(sender, receiver, amount, currency, transactionId).replace('sent', 'received'),
    };

    await Promise.all([
      transporter.sendMail(senderEmail),
      transporter.sendMail(receiverEmail),
    ]);

    return true;
  } catch (err) {
    console.error('Confirmation email error:', err);
    return false;
  }
};

// Send combine invitation
const sendCombineInvitation = async (member, combiner, combineName, amount) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: member.email,
      subject: '⚡ You\'ve Been Added to a Combine - Wavva Pay',
      html: emailTemplates.combineInvitation(combiner, combineName, amount),
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error('Combine invitation error:', err);
    return false;
  }
};

module.exports = {
  sendEmailVerification,
  sendOTP,
  sendPaymentConfirmation,
  sendCombineInvitation,
};
