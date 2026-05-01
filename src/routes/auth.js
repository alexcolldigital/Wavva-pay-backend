const express = require('express');
const authController = require('../controllers/authController');
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
router.post('/signup', authController.signup);

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
router.post('/login', authController.login);

/**
 * @swagger
 * /auth/admin/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Admin login
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
 *         description: Admin login successful
 *       401:
 *         description: Invalid credentials or not an admin
 *       500:
 *         description: Server error
 */
router.post('/admin/login', authController.adminLogin);

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
router.post('/google', authController.googleSignIn);

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
router.post('/refresh', authController.refreshTokens);

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
router.post('/send-otp', authController.sendOtpHandler);

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
router.post('/verify-otp', authController.verifyOtp);
router.post('/verify-signup', authController.completeSignupVerification);
router.post('/resend-verification', authController.resendSignupVerification);

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
router.post('/logout', authController.logout);

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
router.post('/forgot-password', authController.forgotPassword);

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
router.post('/reset-password', authController.resetPassword);

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
router.get('/pin-status', authController.getPinStatus);

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
router.post('/set-pin', authController.setPin);

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
router.post('/verify-pin', authController.verifyPin);

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
router.post('/change-pin', authController.changePin);

module.exports = router;
