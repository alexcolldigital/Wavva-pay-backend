/**
 * Banking Middleware
 * Security, validation, and rate limiting for hands-free banking operations
 */

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for general banking operations
 * 20 requests per hour per user
 */
const bankingRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: 'Too many banking requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
});

/**
 * Rate limiter for transaction execution
 * 10 transactions per hour per user
 */
const transactionExecutionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: 'Transaction limit reached. Please try again later.',
});

/**
 * Rate limiter for biometric verification attempts
 * 5 attempts per 15 minutes (per transaction)
 */
const biometricRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: (req) => `${req.user?.id}-${req.body?.transactionId}`,
  message: 'Too many verification attempts. Please try again later.',
});

/**
 * Validate banking session middleware
 */
const validateBankingSession = async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Banking session ID is required',
      });
    }

    // Validate session ID format
    if (!sessionId.startsWith('BANK-')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID format',
      });
    }

    req.bankingSessionId = sessionId;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Session validation failed',
    });
  }
};

/**
 * Validate command payload
 */
const validateCommand = (req, res, next) => {
  try {
    const { command, sessionId } = req.body;

    if (!command || typeof command !== 'string' || command.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Voice command text is required and must be non-empty',
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Banking session ID is required',
      });
    }

    // Validate command length
    if (command.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Command text is too long (max 1000 characters)',
      });
    }

    req.voiceCommand = command.trim();
    req.bankingSessionId = sessionId;
    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Command validation failed',
    });
  }
};

/**
 * Validate biometric data
 */
const validateBiometricData = (req, res, next) => {
  try {
    const { verificationSessionId, biometricData } = req.body;

    if (!verificationSessionId || typeof verificationSessionId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Verification session ID is required',
      });
    }

    if (!biometricData || typeof biometricData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Biometric data is required',
      });
    }

    // Validate based on method type
    const { pin, otp, fingerprint, faceImage } = biometricData;

    // At least one biometric input should be present
    if (!pin && !otp && !fingerprint && !faceImage) {
      return res.status(400).json({
        success: false,
        error: 'No biometric data provided',
      });
    }

    // Validate PIN format
    if (pin && (!/^\d{4}$/.test(pin))) {
      return res.status(400).json({
        success: false,
        error: 'PIN must be 4 digits',
      });
    }

    // Validate OTP format
    if (otp && (!/^\d{6}$/.test(otp))) {
      return res.status(400).json({
        success: false,
        error: 'OTP must be 6 digits',
      });
    }

    // Validate face image if present
    if (faceImage && typeof faceImage !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Face image must be base64 encoded string',
      });
    }

    req.biometricData = biometricData;
    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Biometric data validation failed',
    });
  }
};

/**
 * Validate transaction data
 */
const validateTransactionData = (req, res, next) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID is required',
      });
    }

    // Validate transaction ID format
    if (!transactionId.startsWith('TX-')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID format',
      });
    }

    req.transactionId = transactionId;
    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Transaction data validation failed',
    });
  }
};

/**
 * Transaction middleware - replaces validateTransactionData
 * Validates transaction and applies execution rate limiting
 */
const transactionMiddleware = [
  validateTransactionData,
  transactionExecutionLimiter,
];

/**
 * Generic payload validator
 * @param {string} type - Type of payload to validate (session, command, biometric_initiate, biometric_confirm, transaction_execute, transaction_cancel)
 */
const validateBankingPayload = (type) => {
  return (req, res, next) => {
    switch (type) {
      case 'session':
        return validateBankingSession(req, res, next);
      case 'command':
        return validateCommand(req, res, next);
      case 'biometric_initiate':
        return validateBankingSession(req, res, next);
      case 'biometric_confirm':
        return validateBiometricData(req, res, next);
      case 'transaction_execute':
        return validateTransactionData(req, res, next);
      case 'transaction_cancel':
        return validateTransactionData(req, res, next);
      default:
        return next();
    }
  };
};

/**
 * Mask sensitive data in responses
 * Middleware to override res.json() to mask PII
 */
const maskSensitiveDataMiddleware = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    if (data && typeof data === 'object') {
      data = maskSensitiveData(data);
    }
    return originalJson(data);
  };

  next();
};

/**
 * Helper function to mask sensitive data
 */
const maskSensitiveData = (obj) => {
  if (!obj) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveData(item));
  }

  if (typeof obj === 'object') {
    const masked = { ...obj };

    // Mask account numbers
    if (masked.accountNumber) {
      masked.accountNumber = masked.accountNumber.replace(
        /\d(?=\d{4})/g,
        '*'
      );
    }

    // Mask phone numbers
    if (masked.phone) {
      masked.phone = masked.phone.replace(/\d(?=\d{4})/g, '*');
    }

    // Mask email addresses
    if (masked.email) {
      const [name, domain] = masked.email.split('@');
      masked.email = `${name.charAt(0)}***@${domain}`;
    }

    // Recursively mask nested objects
    for (const key in masked) {
      if (typeof masked[key] === 'object') {
        masked[key] = maskSensitiveData(masked[key]);
      }
    }

    return masked;
  }

  return obj;
};

/**
 * Log banking activity for audit trail
 */
const logBankingActivityMiddleware = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    // Log activity
    const activity = {
      timestamp: new Date(),
      userId: req.user?.id,
      endpoint: req.path,
      method: req.method,
      status: res.statusCode,
      duration: Date.now() - req.startTime,
    };

    console.log('[Banking Activity]', activity);

    return originalJson(data);
  };

  req.startTime = Date.now();
  next();
};

/**
 * Check transaction risk level
 */
const checkTransactionRisk = (req, res, next) => {
  try {
    const { amount } = req.body;

    if (amount !== undefined) {
      if (amount > 5000000) {
        // Flag high-value transactions
        req.transactionRisk = {
          level: 'HIGH',
          reason: 'High transaction amount',
        };
      } else if (amount > 1000000) {
        req.transactionRisk = {
          level: 'MEDIUM',
          reason: 'Medium transaction amount',
        };
      } else {
        req.transactionRisk = {
          level: 'LOW',
          reason: 'Low risk transaction',
        };
      }
    }

    next();
  } catch (error) {
    console.error('Error checking transaction risk:', error);
    next();
  }
};

/**
 * Validate user's KYC status
 */
const validateKYCStatus = async (req, res, next) => {
  try {
    const { user } = req;

    if (!user.kyc || user.kyc.status !== 'VERIFIED') {
      return res.status(403).json({
        success: false,
        error: 'KYC verification required for banking operations',
        kycStatus: user.kyc?.status || 'PENDING',
      });
    }

    next();
  } catch (error) {
    console.error('Error validating KYC status:', error);
    res.status(500).json({
      success: false,
      error: 'KYC validation failed',
    });
  }
};

/**
 * Validate transaction limit
 */
const validateTransactionLimit = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const { user } = req;

    if (!amount) {
      return next();
    }

    // Check user's daily transaction limit
    const dailyLimit = user.transactionLimit || 10000000;

    // TODO: Query actual daily total from database
    // For now, assume no transactions today
    const todayTotal = 0;

    if (todayTotal + amount > dailyLimit) {
      return res.status(412).json({
        success: false,
        error: 'Daily transaction limit exceeded',
        limit: dailyLimit,
        remaining: dailyLimit - todayTotal,
      });
    }

    next();
  } catch (error) {
    console.error('Error validating transaction limit:', error);
    res.status(500).json({
      success: false,
      error: 'Transaction limit validation failed',
    });
  }
};

module.exports = {
  bankingRateLimiter,
  transactionExecutionLimiter,
  biometricRateLimiter,
  validateBankingSession,
  validateCommand,
  validateBiometricData,
  validateTransactionData,
  transactionMiddleware,
  validateBankingPayload,
  maskSensitiveDataMiddleware,
  maskSensitiveData,
  logBankingActivityMiddleware,
  checkTransactionRisk,
  validateKYCStatus,
  validateTransactionLimit,
};
