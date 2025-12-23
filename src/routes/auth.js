const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { sendEmailVerification, sendEmailVerificationCode, sendOTP } = require('../services/notifications');
const { generateTokenPair, verifyToken } = require('../utils/tokenManager');
const logger = require('../utils/logger');
const router = express.Router();

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Create a new user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/signup', async (req, res) => {
  console.log('[DEBUG] Signup route hit');
  console.log('[DEBUG] Request body:', req.body);
  
  try {
    const { firstName, lastName, email, phone, password } = req.body;
    
    console.log('[DEBUG] Signup request received:', { firstName, lastName, email });
    
    // Validation
    if (!firstName || !lastName || !email || !password) {
      console.log('[DEBUG] Validation failed - missing fields');
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields. Please provide: firstName, lastName, email, password'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('[DEBUG] Invalid email format:', email);
      return res.status(400).json({ 
        success: false,
        error: `Invalid email format: "${email}". Please enter a valid email address.`
      });
    }
    
    // Validate password length
    if (password.length < 6) {
      console.log('[DEBUG] Password too short');
      return res.status(400).json({ 
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }
    
    // Check if user exists
    console.log('[DEBUG] Checking if user exists:', email);
    const existing = await User.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      console.log('[DEBUG] User already exists:', email);
      return res.status(400).json({ 
        success: false,
        error: 'This email or phone number is already registered. Please login or use a different email.'
      });
    }
    
    console.log('[DEBUG] Creating user');
    const user = new User({
      firstName,
      lastName,
      email,
      phone,
      passwordHash: password,
      qrCodeData: `wavva_pay_${email}_${Date.now()}`,
    });
    
    console.log('[DEBUG] Saving user...');
    await user.save();
    console.log('[DEBUG] User saved successfully');
    
    console.log('[DEBUG] Creating wallet...');
    const wallet = new Wallet({ userId: user._id });
    await wallet.save();
    console.log('[DEBUG] Wallet created');
    
    user.walletId = wallet._id;
    console.log('[DEBUG] Saving wallet reference...');
    await user.save();
    console.log('[DEBUG] Wallet reference saved');
    
    // Send email verification code
    console.log('[DEBUG] Sending email verification...');
    try {
      await sendEmailVerificationCode(user);
      console.log('[DEBUG] Email sent successfully');
    } catch (emailErr) {
      console.error('[WARN] Email sending failed (non-critical):', emailErr.message);
      // Don't fail signup if email fails
    }
    
    console.log('[DEBUG] Generating tokens...');
    const { accessToken, refreshToken } = generateTokenPair(user._id);
    
    console.log('[DEBUG] Sending success response...');
    res.status(201).json({
      success: true,
      message: 'Account created successfully! Please check your email for verification.',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone || '',
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.profilePicture,
        status: user.accountStatus || 'active',
        kycStatus: user.kyc?.verified ? 'verified' : 'pending',
        isAdmin: user.isAdmin || false,
        createdAt: user.createdAt
      }
    });
    console.log('[DEBUG] Response sent successfully');
  } catch (err) {
    console.error('[ERROR] Signup error occurred');
    console.error('[ERROR] Error message:', err.message);
    console.error('[ERROR] Error stack:', err.stack);
    
    // Check for specific MongoDB errors
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({
        success: false,
        error: `This ${field} is already registered. Please use a different ${field}.`
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: err.message || 'Account creation failed. Please try again later.',
      ...(process.env.NODE_ENV === 'development' && { details: err.stack })
    });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user || !await user.comparePassword(password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token pair (access + refresh)
    const { accessToken, refreshToken } = generateTokenPair(user._id);
    
    res.json({ 
      accessToken, 
      refreshToken,
      user: { 
        id: user._id,
        email: user.email,
        phone: user.phone || '',
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.profilePicture,
        status: user.accountStatus || 'active',
        kycStatus: user.kyc?.verified ? 'verified' : 'pending',
        isAdmin: user.isAdmin || false,
        createdAt: user.createdAt
      } 
    });
  } catch (err) {
    logger.error('Login failed', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * @swagger
 * /auth/google:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Sign in with Google OAuth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               googleId:
 *                 type: string
 *               email:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               profilePicture:
 *                 type: string
 *     responses:
 *       200:
 *         description: Google sign-in successful
 */
router.post('/google', async (req, res) => {
  try {
    const { googleId, email, firstName, lastName, profilePicture } = req.body;
    
    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    
    if (!user) {
      user = new User({
        googleId,
        email,
        firstName,
        lastName,
        profilePicture,
        emailVerified: true, // Google auto-verifies
        qrCodeData: `wavva_pay_${email}_${Date.now()}`,
      });
      
      await user.save();
      
      // Create wallet
      const wallet = new Wallet({ userId: user._id });
      await wallet.save();
      user.walletId = wallet._id;
      await user.save();
    }
    
    // Generate token pair (access + refresh)
    const { accessToken, refreshToken } = generateTokenPair(user._id);
    
    res.json({ 
      accessToken, 
      refreshToken,
      user: { 
        id: user._id,
        email: user.email,
        phone: user.phone || '',
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.profilePicture,
        status: user.accountStatus || 'active',
        kycStatus: user.kyc?.verified ? 'verified' : 'pending',
        isAdmin: user.isAdmin || false,
        createdAt: user.createdAt
      } 
    });
  } catch (err) {
    logger.error('Google sign-in failed', err.message);
    res.status(500).json({ error: 'Google sign-in failed' });
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Refresh access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New tokens generated
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = verifyToken(refreshToken);
    if (!decoded || decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tokens = generateTokenPair(user._id);
    logger.info('Token refreshed', { userId: user._id });

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    logger.error('Token refresh failed', err.message);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * @swagger
 * /auth/send-otp:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Send OTP to phone number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent successfully
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    const user = await User.findOne({ phone });
    
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    await sendOTP(user);
    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    res.status(500).json({ error: 'OTP send failed' });
  }
});

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Verify OTP and get token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const user = await User.findOne({ phone });
    
    if (!user || user.phoneVerificationOTP !== otp || new Date() > user.phoneVerificationExpires) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    user.phoneVerified = true;
    user.phoneVerificationOTP = null;
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });
    
    res.json({ token, message: 'Phone verified successfully' });
  } catch (err) {
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Logout (invalidate tokens)
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Send password reset email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reset email sent
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Generate reset token
    const resetToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '1h'
    });
    
    // TODO: Send reset email with token
    // await sendPasswordResetEmail(user, resetToken);
    
    logger.info('Password reset requested', { userId: user._id });
    res.json({ message: 'Password reset email sent' });
  } catch (err) {
    logger.error('Password reset failed', err.message);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Reset password with token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successful
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Invalid token' });
    }
    
    user.passwordHash = password;
    await user.save();
    
    logger.info('Password reset completed', { userId: user._id });
    res.json({ message: 'Password reset successful' });
  } catch (err) {
    logger.error('Password reset failed', err.message);
    res.status(400).json({ error: 'Invalid or expired token' });
  }
});

/**
 * @swagger
 * /auth/send-email-verification-code:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Send email verification code (8 digits)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification code sent
 */
router.post('/send-email-verification-code', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }
    
    await sendEmailVerificationCode(user);
    logger.info('Email verification code sent', { userId: user._id });
    
    res.json({ message: 'Verification code sent to your email' });
  } catch (err) {
    logger.error('Send verification code failed', err.message);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

/**
 * @swagger
 * /auth/verify-email-code:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Verify email with 8-digit code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 */
router.post('/verify-email-code', async (req, res) => {
  try {
    const { userId, code } = req.body;
    
    if (!userId || !code) {
      return res.status(400).json({ error: 'User ID and code required' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if code is expired
    if (!user.emailVerificationCodeExpires || new Date() > user.emailVerificationCodeExpires) {
      return res.status(400).json({ error: 'Verification code has expired' });
    }
    
    // Check if code matches
    if (user.emailVerificationCode !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    
    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationCode = null;
    user.emailVerificationCodeExpires = null;
    await user.save();
    
    logger.info('Email verified with code', { userId: user._id });
    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    logger.error('Email code verification failed', err.message);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Verify email with token (legacy)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { userId, token } = req.body;
    const user = await User.findById(userId);
    
    if (!user || user.emailVerificationToken !== token) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }
    
    user.emailVerified = true;
    user.emailVerificationToken = null;
    await user.save();
    
    logger.info('Email verified', { userId: user._id });
    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    logger.error('Email verification failed', err.message);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    // In production, add tokens to blacklist cache (Redis)
    logger.info('User logged out');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error('Logout failed', err.message);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * @swagger
 * /auth/pin-status:
 *   get:
 *     tags:
 *       - PIN Management
 *     summary: Check if user has PIN set
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PIN status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isSet:
 *                   type: boolean
 */
router.get('/pin-status', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.userId);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({ isSet: !!user.pin });
  } catch (err) {
    logger.error('PIN status check failed', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * @swagger
 * /auth/set-pin:
 *   post:
 *     tags:
 *       - PIN Management
 *     summary: Set up a new transaction PIN
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pin:
 *                 type: string
 *                 description: 4-digit PIN
 *     responses:
 *       200:
 *         description: PIN set successfully
 */
router.post('/set-pin', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const { pin } = req.body;
    
    // Validate PIN
    if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4 digits' });
    }
    
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (user.pin) {
      return res.status(400).json({ error: 'PIN already set. Use change-pin endpoint' });
    }
    
    user.pin = pin;
    await user.save();
    
    logger.info('PIN set successfully', { userId: user._id });
    res.json({ success: true, message: 'PIN set successfully' });
  } catch (err) {
    logger.error('Set PIN failed', err.message);
    res.status(500).json({ error: 'Failed to set PIN' });
  }
});

/**
 * @swagger
 * /auth/verify-pin:
 *   post:
 *     tags:
 *       - PIN Management
 *     summary: Verify PIN for transactions
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pin:
 *                 type: string
 *                 description: 4-digit PIN
 *     responses:
 *       200:
 *         description: PIN verified
 */
router.post('/verify-pin', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const { pin } = req.body;
    
    // Validate PIN
    if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4 digits' });
    }
    
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Check if account is locked
    if (user.pinLockedUntil && new Date() < user.pinLockedUntil) {
      return res.status(429).json({ error: 'PIN locked. Try again later' });
    }
    
    // Check PIN
    const isValid = await user.comparePin(pin);
    
    if (!isValid) {
      user.pinAttempts = (user.pinAttempts || 0) + 1;
      
      // Lock after 3 failed attempts
      if (user.pinAttempts >= 3) {
        user.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        user.pinAttempts = 0;
      }
      
      await user.save();
      return res.status(400).json({ error: 'Invalid PIN' });
    }
    
    // Reset attempts on success
    user.pinAttempts = 0;
    user.pinLockedUntil = null;
    await user.save();
    
    logger.info('PIN verified successfully', { userId: user._id });
    res.json({ success: true, message: 'PIN verified' });
  } catch (err) {
    logger.error('Verify PIN failed', err.message);
    res.status(500).json({ error: 'Failed to verify PIN' });
  }
});

/**
 * @swagger
 * /auth/change-pin:
 *   post:
 *     tags:
 *       - PIN Management
 *     summary: Change existing transaction PIN
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               oldPin:
 *                 type: string
 *                 description: Current 4-digit PIN
 *               newPin:
 *                 type: string
 *                 description: New 4-digit PIN
 *     responses:
 *       200:
 *         description: PIN changed successfully
 */
router.post('/change-pin', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const { oldPin, newPin } = req.body;
    
    // Validate inputs
    if (!oldPin || oldPin.length !== 4 || !/^\d+$/.test(oldPin)) {
      return res.status(400).json({ error: 'Current PIN must be 4 digits' });
    }
    
    if (!newPin || newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      return res.status(400).json({ error: 'New PIN must be 4 digits' });
    }
    
    if (oldPin === newPin) {
      return res.status(400).json({ error: 'New PIN must be different from current PIN' });
    }
    
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Verify old PIN
    const isValid = await user.comparePin(oldPin);
    if (!isValid) {
      return res.status(400).json({ error: 'Current PIN is incorrect' });
    }
    
    // Set new PIN
    user.pin = newPin;
    await user.save();
    
    logger.info('PIN changed successfully', { userId: user._id });
    res.json({ success: true, message: 'PIN changed successfully' });
  } catch (err) {
    logger.error('Change PIN failed', err.message);
    res.status(500).json({ error: 'Failed to change PIN' });
  }
});

module.exports = router;
