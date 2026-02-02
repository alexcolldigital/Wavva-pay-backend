const validator = require('validator');
const rateLimit = require('express-rate-limit');
const security = require('../utils/security');

// Enhanced email validation
const validateEmail = (email) => {
  return validator.isEmail(email) && email.length <= 254;
};

// Enhanced phone validation (Nigerian focus)
const validatePhone = (phone) => {
  return security.validateNigerianPhone(phone);
};

// Enhanced amount validation
const validateAmount = (amount) => {
  const numAmount = parseFloat(amount);
  return !isNaN(numAmount) && numAmount > 0 && numAmount <= 5000000; // Max ₦5M
};

// BVN validation
const validateBVN = (bvn) => {
  return security.validateBVN(bvn);
};

// NIN validation
const validateNIN = (nin) => {
  return security.validateNIN(nin);
};

// Password strength validation
const validatePassword = (password) => {
  return validator.isStrongPassword(password, {
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1
  });
};

// Input sanitization middleware
const inputValidator = (req, res, next) => {
  // Sanitize all string inputs
  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = security.sanitizeInput(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  next();
};

// Transaction validation middleware
const validateTransaction = (req, res, next) => {
  const { amount, recipient, type } = req.body;

  const errors = [];

  if (!amount || !validateAmount(amount)) {
    errors.push('Invalid amount');
  }

  if (!recipient) {
    errors.push('Recipient is required');
  }

  if (!type || !['transfer', 'payment', 'withdrawal'].includes(type)) {
    errors.push('Invalid transaction type');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  next();
};

// KYC validation middleware
const validateKYC = (req, res, next) => {
  const { bvn, nin, idType, idNumber } = req.body;

  const errors = [];

  if (bvn && !validateBVN(bvn)) {
    errors.push('Invalid BVN format');
  }

  if (nin && !validateNIN(nin)) {
    errors.push('Invalid NIN format');
  }

  if (idType && !['passport', 'drivers_license', 'voters_card', 'nin'].includes(idType)) {
    errors.push('Invalid ID type');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'KYC validation failed', details: errors });
  }

  next();
};

// Rate limiting for sensitive endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const transactionRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 transactions per minute
  message: 'Too many transactions, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { 
  validateEmail, 
  validatePhone, 
  validateAmount, 
  validateBVN,
  validateNIN,
  validatePassword,
  inputValidator,
  validateTransaction,
  validateKYC,
  authRateLimit,
  transactionRateLimit
};
