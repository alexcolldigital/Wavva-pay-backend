const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const wemaService = require('../services/wema');
const { sendOTP } = require('../services/notifications');
const { generateTokenPair, verifyToken } = require('../utils/tokenManager');
const logger = require('../utils/logger');

// Signup
const signup = async (req, res) => {
  console.log('[DEBUG] Signup route hit');
  console.log('[DEBUG] Request body:', req.body);
  
  try {
    const { firstName, lastName, username, email, phone, password } = req.body;
    
    console.log('[DEBUG] Signup request received:', { firstName, lastName, username, email, phone });
    
    // Validate each field individually
    const errors = {};
    
    // Validate firstName
    if (!firstName || firstName.trim() === '') {
      errors.firstName = 'First name is required';
      console.log('[VALIDATION] First name missing');
    } else if (firstName.length < 2) {
      errors.firstName = 'First name must be at least 2 characters';
      console.log('[VALIDATION] First name too short');
    }
    
    // Validate lastName
    if (!lastName || lastName.trim() === '') {
      errors.lastName = 'Last name is required';
      console.log('[VALIDATION] Last name missing');
    } else if (lastName.length < 2) {
      errors.lastName = 'Last name must be at least 2 characters';
      console.log('[VALIDATION] Last name too short');
    }
    
    // Validate username
    if (!username || username.trim() === '') {
      errors.username = 'Username is required';
      console.log('[VALIDATION] Username missing');
    } else if (username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
      console.log('[VALIDATION] Username too short');
    } else if (username.length > 20) {
      errors.username = 'Username must be less than 20 characters';
      console.log('[VALIDATION] Username too long');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.username = 'Username can only contain letters, numbers, underscores, and hyphens';
      console.log('[VALIDATION] Invalid username format:', username);
    }
    
    // Validate email
    if (!email || email.trim() === '') {
      errors.email = 'Email address is required';
      console.log('[VALIDATION] Email missing');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.email = `Invalid email format: "${email}". Please enter a valid email address.`;
        console.log('[VALIDATION] Invalid email format:', email);
      }
    }
    
    // Validate phone (optional but if provided should be valid)
    if (phone && phone.trim() !== '') {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/; // E.164 format
      if (!phoneRegex.test(phone)) {
        errors.phone = `Invalid phone format: "${phone}". Please use format like +1234567890 or 1234567890`;
        console.log('[VALIDATION] Invalid phone format:', phone);
      }
    }
    
    // Validate password
    if (!password || password === '') {
      errors.password = 'Password is required';
      console.log('[VALIDATION] Password missing');
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters long';
      console.log('[VALIDATION] Password too short:', password.length);
    } else if (password.length > 128) {
      errors.password = 'Password must be less than 128 characters';
      console.log('[VALIDATION] Password too long');
    }
    
    // If there are validation errors, return them all
    if (Object.keys(errors).length > 0) {
      console.log('[VALIDATION] Multiple validation errors:', errors);
      return res.status(400).json({
        success: false,
        error: 'Please fix the following errors:',
        errors,
        message: Object.values(errors).join('; ')
      });
    }
    
    // OPTIMIZATION: Parallelize all existence checks into single Promise.all()
    console.log('[DEBUG] Checking if username, email, and phone already exist...');
    const [existingUsername, existingEmail, existingPhone] = await Promise.all([
      User.findOne({ username: username.toLowerCase() }),
      User.findOne({ email: email.toLowerCase() }),
      phone && phone.trim() !== '' ? User.findOne({ phone }) : Promise.resolve(null)
    ]);
    
    if (existingUsername) {
      console.log('[VALIDATION] Username already taken:', username);
      return res.status(400).json({
        success: false,
        error: 'Username already taken',
        errors: {
          username: `This username is already taken. Please choose a different username.`
        }
      });
    }
    
    if (existingEmail) {
      console.log('[VALIDATION] Email already registered:', email);
      return res.status(400).json({
        success: false,
        error: 'Email address already registered',
        errors: {
          email: `This email address is already registered. Please login or use a different email.`
        }
      });
    }
    
    if (existingPhone) {
      console.log('[VALIDATION] Phone already registered:', phone);
      return res.status(400).json({
        success: false,
        error: 'Phone number already registered',
        errors: {
          phone: `This phone number is already registered. Please use a different phone number.`
        }
      });
    }
    
    console.log('[DEBUG] All validations passed');
    console.log('[DEBUG] Creating user with email:', email);
    const user = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      username: username.toLowerCase().trim(),
      email: email.toLowerCase(),
      phone: phone ? phone.trim() : undefined,
      passwordHash: password,
      qrCodeData: `wavva_pay_${email}_${Date.now()}`,
    });
    
    console.log('[DEBUG] Saving user...');
    await user.save();
    console.log('[DEBUG] User saved successfully');
    
    console.log('[DEBUG] Creating wallet with NGN support...');
    const wallet = new Wallet({ 
      userId: user._id,
      wallets: [
        {
          currency: 'NGN',
          balance: 0,
          dailyLimit: 10000 * 100,
          monthlyLimit: 100000 * 100,
        }
      ]
    });
    await wallet.save();
    console.log('[DEBUG] Wallet created with NGN');
    
    user.walletId = wallet._id;
    console.log('[DEBUG] Saving wallet reference...');
    await user.save();
    console.log('[DEBUG] Wallet reference saved');
    
    // Create virtual account for user (Wema ALAT)
    console.log('[DEBUG] Creating virtual account...');
    try {
      const virtualAccountResult = await wemaService.createVirtualAccount(
        user._id.toString(),
        user.email,
        user.firstName,
        user.lastName,
        user.phone || '',
        { platform: 'wavvapay' }
      );
      
      if (virtualAccountResult.success) {
        user.virtualAccount = {
          accountNumber: virtualAccountResult.accountNumber,
          accountName: virtualAccountResult.accountName,
          bankCode: virtualAccountResult.bankCode,
          bankName: virtualAccountResult.bankName,
          status: virtualAccountResult.status,
          accountId: virtualAccountResult.accountId,
          reference: virtualAccountResult.reference,
          createdAt: new Date(),
        };
        await user.save();
        console.log('[DEBUG] Virtual account created and assigned:', virtualAccountResult.accountNumber);
      } else {
        // Virtual account creation failed but continue (non-critical)
        logger.warn('Virtual account creation failed:', virtualAccountResult.error);
        console.log('[WARN] Virtual account creation failed, continuing without it');
      }
    } catch (vatErr) {
      // Virtual account creation failed but continue (non-critical)
      logger.error('Virtual account creation error:', vatErr.message);
      console.log('[WARN] Virtual account error, continuing without it:', vatErr.message);
    }
    
    console.log('[DEBUG] Generating tokens...');
    const { accessToken, refreshToken } = generateTokenPair(user._id);
    
    console.log('[DEBUG] Sending success response...');
    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone || '',
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.profilePicture,
        status: user.accountStatus || 'active',
        emailVerified: user.emailVerified || false,
        kycStatus: user.kyc?.verified ? 'verified' : 'pending',
        isAdmin: user.isAdmin || false,
        virtualAccount: user.virtualAccount ? {
          accountNumber: user.virtualAccount.accountNumber,
          accountName: user.virtualAccount.accountName,
          bankCode: user.virtualAccount.bankCode,
          bankName: user.virtualAccount.bankName,
          status: user.virtualAccount.status
        } : null,
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
        error: `${field} already exists`,
        errors: {
          [field]: `This ${field} is already registered. Please use a different ${field}.`
        }
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: err.message || 'Account creation failed. Please try again later.',
      ...(process.env.NODE_ENV === 'development' && { details: err.stack })
    });
  }
};

// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Allow login with either email or username
    // Check if input looks like an email
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    
    // Find user by email or username
    const user = isEmail 
      ? await User.findOne({ email: email.toLowerCase() })
      : await User.findOne({ username: email.toLowerCase() });
    
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
        username: user.username,
        email: user.email,
        phone: user.phone || '',
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.profilePicture,
        status: user.accountStatus || 'active',
        emailVerified: user.emailVerified || false,
        kycStatus: user.kyc?.verified ? 'verified' : 'pending',
        isAdmin: user.isAdmin || false,
        createdAt: user.createdAt
      } 
    });
  } catch (err) {
    logger.error('Login failed', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Admin login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is admin
    if (!user.isAdmin) {
      return res.status(401).json({ error: 'Not authorized as admin' });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token pair (access + refresh)
    const { accessToken, refreshToken } = generateTokenPair(user._id);

    res.json({
      token: accessToken,
      refreshToken,
      admin: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || '',
        isAdmin: user.isAdmin,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    logger.error('Admin login failed:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Google OAuth
const googleSignIn = async (req, res) => {
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
      
      // Create virtual account for user (Wema ALAT)
      try {
        const virtualAccountResult = await wemaService.createVirtualAccount(
          user._id.toString(),
          user.email,
          user.firstName,
          user.lastName,
          user.phone || '',
          { platform: 'wavvapay' }
        );
        
        if (virtualAccountResult.success) {
          user.virtualAccount = {
            accountNumber: virtualAccountResult.accountNumber,
            accountName: virtualAccountResult.accountName,
            bankCode: virtualAccountResult.bankCode,
            bankName: virtualAccountResult.bankName,
            status: virtualAccountResult.status,
            accountId: virtualAccountResult.accountId,
            reference: virtualAccountResult.reference,
            createdAt: new Date(),
          };
        }
      } catch (vatErr) {
        logger.warn('Virtual account creation failed for Google sign-up:', vatErr.message);
      }
      
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
        virtualAccount: user.virtualAccount ? {
          accountNumber: user.virtualAccount.accountNumber,
          accountName: user.virtualAccount.accountName,
          bankCode: user.virtualAccount.bankCode,
          bankName: user.virtualAccount.bankName,
          status: user.virtualAccount.status
        } : null,
        createdAt: user.createdAt
      } 
    });
  } catch (err) {
    logger.error('Google sign-in failed', err.message);
    res.status(500).json({ error: 'Google sign-in failed' });
  }
};

// Refresh tokens
const refreshTokens = async (req, res) => {
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
};

// Send OTP
const sendOtpHandler = async (req, res) => {
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
};

// Verify OTP
const verifyOtp = async (req, res) => {
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
};

// Logout
const logout = async (req, res) => {
  try {
    // In production, add tokens to blacklist cache (Redis)
    logger.info('User logged out');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error('Logout failed', err.message);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// Forgot password
const forgotPassword = async (req, res) => {
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
};

// Reset password
const resetPassword = async (req, res) => {
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
};

// PIN status
const getPinStatus = async (req, res) => {
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
};

// Set PIN
const setPin = async (req, res) => {
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
};

// Verify PIN
const verifyPin = async (req, res) => {
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
};

// Change PIN
const changePin = async (req, res) => {
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
};

module.exports = {
  signup,
  login,
  adminLogin,
  googleSignIn,
  refreshTokens,
  sendOtpHandler,
  verifyOtp,
  logout,
  forgotPassword,
  resetPassword,
  getPinStatus,
  setPin,
  verifyPin,
  changePin,
};
