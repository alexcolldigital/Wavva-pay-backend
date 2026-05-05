const nodemailer = require('nodemailer');
const twilio = require('twilio');
const crypto = require('crypto');

// Email configuration - Check if email credentials are valid
const isEmailConfigured = () => {
  return process.env.EMAIL_USER && 
         process.env.EMAIL_PASSWORD && 
         !process.env.EMAIL_USER.includes('your-') &&
         !process.env.EMAIL_PASSWORD.includes('your-');
};

// Initialize email transporter only if configured
let transporter = null;
if (isEmailConfigured()) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,  // Changed from 587 to 465 (SSL instead of TLS)
    secure: true, // Use SSL encryption
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    connectionTimeout: 15000, // 15 seconds
    socketTimeout: 15000,    // 15 seconds
    greetingTimeout: 10000,  // 10 seconds
    pool: {
      maxConnections: 1,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 5
    },
    tls: {
      rejectUnauthorized: false // Allow self-signed certs
    }
  });
  console.log('✅ Email service configured - using Gmail SMTP');
  console.log(`   From: ${process.env.EMAIL_USER}`);
  console.log(`   Port: 465 (SSL)`);
  
  // Verify transporter connection on startup (non-blocking)
  transporter.verify((error, success) => {
    if (error) {
      console.error('⚠️ Email service verification failed:', error.message);
      console.error('   This may indicate authentication issues with Gmail.');
      console.error('   Make sure you are using an App Password, not your regular password.');
      console.error('   See EMAIL_SETUP.md for configuration instructions.');
    } else if (success) {
      console.log('✅ Email service verified - SMTP connection successful');
    }
  });
} else {
  console.warn('⚠️ Email service NOT configured');
  console.warn('   EMAIL_USER:', process.env.EMAIL_USER ? '✓ set' : '✗ missing');
  console.warn('   EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '✓ set' : '✗ missing');
  console.warn('   Verification emails will be logged to console instead');
}

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
  verificationCode: (code, expiryMinutes) => `
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #000; color: #fff;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3B82F6;">Welcome to Wavva Pay</h2>
          <p>Thank you for creating a WavvaPay account. You're required to verify your email address with the code below.</p>
          <div style="background-color: #1a1a1a; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3B82F6; text-align: center;">
            <p style="font-size: 14px; color: #999; margin-bottom: 10px;">Your verification code:</p>
            <p style="font-size: 36px; font-weight: bold; color: #3B82F6; letter-spacing: 5px; margin: 10px 0;">${code}</p>
            <p style="font-size: 12px; color: #999;">Valid for ${expiryMinutes} minutes</p>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">If you didn't request this code, please ignore this email.</p>
        </div>
      </body>
    </html>
  `,

  verification: (verificationLink) => `
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #000; color: #fff;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3B82F6;">Welcome to Wavva Pay</h2>
          <p>Verify your email to unlock the power of seamless payments.</p>
          <a href="${verificationLink}" style="background-color: #3B82F6; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; margin: 20px 0;">
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
          <h2 style="color: #3B82F6;">Payment Confirmed</h2>
          <p>You sent <strong>${amount} ${currency}</strong> to <strong>${receiver.firstName} ${receiver.lastName}</strong></p>
          <div style="background-color: #1a1a1a; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #3B82F6;">
            <p><strong>Transaction ID:</strong></p>
            <p style="word-break: break-all; font-family: monospace; font-size: 12px;">${transactionId}</p>
          </div>
          <p style="color: #3B82F6; font-weight: bold;">Thank you for using Wavva Pay</p>
        </div>
      </body>
    </html>
  `,

  combineInvitation: (combiner, combineName, amount) => `
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #000; color: #fff;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3B82F6;">You've Been Added to a Combine</h2>
          <p><strong>${combiner}</strong> added you to <strong>${combineName}</strong></p>
          <p>Total to settle: <strong>${amount}</strong></p>
          <p style="color: #3B82F6; font-weight: bold;">Manage your combines on Wavva Pay</p>
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
    
    console.log(`\n📧 [EMAIL_VERIFY] Generating email verification for ${user.email}`);
    console.log(`📧 [EMAIL_VERIFY] User ID: ${user._id}`);
    console.log(`📧 [EMAIL_VERIFY] Token: ${token.substring(0, 10)}...`);

    if (!transporter) {
      console.warn(`⚠️ [EMAIL_VERIFY] Email transporter not initialized`);
      console.log(`📧 [EMAIL_VERIFY] Development mode: Verification link available in logs`);
      console.log(`📧 [EMAIL_VERIFY] Link: ${verificationLink}`);
      return true;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: '🦑 Wavva Pay - Verify Your Email',
      html: emailTemplates.verification(verificationLink),
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent to ${user.email}`);
    return true;
  } catch (err) {
    console.error('❌ Email send error:', err.message);
    // Don't fail the signup - email verification can be skipped in development
    return true;
  }
};

// Send email verification code (6-digit code)
// Returns: { success: boolean, code: string, emailSent: boolean, error?: string }
const sendEmailVerificationCode = async (user) => {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryMinutes = 15;
    
    console.log(`\n📧 [VERIFY_CODE] Generating verification code for ${user.email}`);
    console.log(`📧 [VERIFY_CODE] Code: ${code}`);
    console.log(`📧 [VERIFY_CODE] Expires in: ${expiryMinutes} minutes`);
    
    user.emailVerificationCode = code;
    user.emailVerificationCodeExpires = new Date(Date.now() + expiryMinutes * 60 * 1000);
    await user.save();
    console.log(`✅ [VERIFY_CODE] Code saved to database for ${user.email}`);

    // If no transporter, return success with code but no email sent
    if (!transporter) {
      console.warn(`⚠️ [VERIFY_CODE] Email transporter not initialized`);
      console.log(`📧 [VERIFY_CODE] Development mode: Code available in logs`);
      console.log(`📧 [VERIFY_CODE] ${user.email} - Code: ${code}`);
      return {
        success: true,
        code: code,
        emailSent: false,
        error: 'Email service not configured'
      };
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: '🦑 Wavva Pay - Your Verification Code',
      html: emailTemplates.verificationCode(code, expiryMinutes),
    };

    console.log(`📧 [VERIFY_CODE] Attempting to send email to ${user.email}...`);
    console.log(`📧 [VERIFY_CODE] From: ${mailOptions.from}`);
    console.log(`📧 [VERIFY_CODE] To: ${mailOptions.to}`);
    
    // Retry logic - try up to 3 times with exponential backoff
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`📧 [VERIFY_CODE] Attempt ${attempt}/3...`);
        const sendResult = await transporter.sendMail(mailOptions);
        console.log(`✅ [VERIFY_CODE] Email sent successfully on attempt ${attempt}!`);
        console.log(`📧 [VERIFY_CODE] Response: ${sendResult.response}`);
        console.log(`📧 [VERIFY_CODE] Message ID: ${sendResult.messageId}\n`);
        return {
          success: true,
          code: code,
          emailSent: true,
          error: null
        };
      } catch (err) {
        lastError = err;
        const waitTime = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.warn(`⚠️ [VERIFY_CODE] Attempt ${attempt}/3 failed: ${err.message}`);
        
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // All retries failed
    throw lastError;
  } catch (err) {
    console.error(`\n❌ [VERIFY_CODE] ERROR - Failed to send verification code`);
    console.error(`❌ [VERIFY_CODE] User email: ${user.email}`);
    console.error(`❌ [VERIFY_CODE] Error message: ${err.message}`);
    if (err.code) {
      console.error(`❌ [VERIFY_CODE] Error code: ${err.code}`);
    }
    
    console.log(`\n⚠️ [VERIFY_CODE] Code was saved to database despite email failure`);
    console.log(`⚠️ [VERIFY_CODE] User can still verify with code: ${user.emailVerificationCode}`);
    
    // Return status object with error info
    return {
      success: true, // Code was saved
      code: user.emailVerificationCode,
      emailSent: false,
      error: err.message || 'Failed to send email'
    };
  }
};

// Send OTP via SMS/WhatsApp
const sendOTP = async (user) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.phoneVerificationOTP = otp;
    user.phoneVerificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    if (!twilioClient) {
      console.warn('Twilio not configured - OTP sending disabled');
      console.log(`📱 [OTP] Development mode: ${user.phone} - Code: ${otp}`);
      return {
        success: true,
        code: otp,
        smsSent: false,
        error: 'SMS service not configured'
      };
    }

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

    return {
      success: true,
      code: otp,
      smsSent: true,
      error: null
    };
  } catch (err) {
    console.error('OTP send error:', err.message);
    return {
      success: false,
      code: null,
      smsSent: false,
      error: err.message || 'Failed to send OTP'
    };
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
    console.error('Confirmation email error:', err.message);
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
    console.error('Combine invitation error:', err.message);
    return false;
  }
};

module.exports = {
  sendEmailVerification,
  sendEmailVerificationCode,
  sendOTP,
  sendPaymentConfirmation,
  sendCombineInvitation,
};
