const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { sendEmailVerification, sendOTP } = require('../services/notifications');
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
  try {
    const { firstName, lastName, email, phone, password } = req.body;
    
    // Validation
    if (!firstName || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if user exists
    const existing = await User.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Create user
    const user = new User({
      firstName,
      lastName,
      email,
      phone,
      passwordHash: password,
      qrCodeData: `wavva_pay_${email}_${Date.now()}`, // Unique QR code
    });
    
    await user.save();
    
    // Create wallet
    const wallet = new Wallet({ userId: user._id });
    await wallet.save();
    
    user.walletId = wallet._id;
    await user.save();
    
    // Send email verification
    await sendEmailVerification(user);
    
    // Generate JWT
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });
    
    res.json({
      token,
      user: { id: user._id, email: user.email, firstName: user.firstName },
      message: 'Signup successful. Please verify your email.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Signup failed' });
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
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });
    
    res.json({ token, user: { id: user._id, email: user.email, firstName: user.firstName } });
  } catch (err) {
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
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });
    
    res.json({ token, user: { id: user._id, email: user.email, firstName: user.firstName } });
  } catch (err) {
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
 * /auth/verify-email:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Verify email with token
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

module.exports = router;
