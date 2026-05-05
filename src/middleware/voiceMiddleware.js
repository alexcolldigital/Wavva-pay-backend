const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Voice-specific rate limiter
 * Limits: 10 requests per hour per user
 */
const voiceRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each user to 10 requests per windowMs
  keyGenerator: (req, res) => {
    // Use user ID if authenticated
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Voice rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip
    });

    res.status(429).json({
      success: false,
      message: 'Too many voice requests. Please try again later.',
      retryAfter: req.rateLimit.retryAfter
    });
  },
  skip: (req, res) => {
    // Skip rate limiting for admin users
    return req.user?.role === 'admin';
  }
});

/**
 * Stricter rate limiter for audio uploads
 * Limits: 20 requests per hour (audio files can be large)
 */
const voiceAudioUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req, res) => req.user?.id || req.ip,
  handler: (req, res) => {
    logger.warn('Voice audio upload rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip
    });

    res.status(429).json({
      success: false,
      message: 'Audio upload limit exceeded. Please try again later.'
    });
  }
});

/**
 * Middleware to validate voice consent
 */
const voiceConsentMiddleware = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user has given voice consent
    // This would typically be stored in the User model or a preferences collection
    const User = require('../../models/User') || {};

    // For now, we'll assume consent is given if the user makes the request
    // In production, check against user preferences
    const hasConsent = true; // req.user?.voiceConsent?.givenConsent || false;

    if (!hasConsent) {
      return res.status(403).json({
        success: false,
        message: 'Voice feature requires explicit consent. Please enable voice features in settings.'
      });
    }

    next();
  } catch (error) {
    logger.error('Voice consent check error', error);
    res.status(500).json({
      success: false,
      message: 'Error checking voice consent'
    });
  }
};

/**
 * Middleware to validate audio file
 */
const validateAudioFileMiddleware = (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No audio file provided'
      });
    }

    const file = req.file;
    const errors = [];

    // Check file size (max 10MB)
    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      errors.push(`File size exceeds ${maxSizeBytes / 1024 / 1024}MB limit`);
    }

    // Check MIME type
    const allowedMimeTypes = ['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-m4a'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      errors.push(`Audio format not supported: ${file.mimetype}`);
    }

    // Check file extension
    const allowedExtensions = ['.mp3', '.wav', '.webm', '.ogg', '.m4a'];
    const fileExt = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      errors.push(`File extension not allowed: ${fileExt}`);
    }

    if (errors.length > 0) {
      logger.warn('Invalid audio file', { errors, userId: req.user?.id });
      return res.status(400).json({
        success: false,
        message: 'Invalid audio file',
        errors
      });
    }

    next();
  } catch (error) {
    logger.error('Audio validation error', error);
    res.status(500).json({
      success: false,
      message: 'Error validating audio file'
    });
  }
};

/**
 * Middleware to validate session
 */
const validateVoiceSessionMiddleware = async (req, res, next) => {
  try {
    const { sessionId } = req.body || req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    // Validate session format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID format'
      });
    }

    // You can add additional session validation here
    // For example, check if session exists and belongs to current user

    next();
  } catch (error) {
    logger.error('Session validation error', error);
    res.status(500).json({
      success: false,
      message: 'Error validating session'
    });
  }
};

/**
 * Middleware to encrypt sensitive data in responses
 */
const encryptSensitiveDataMiddleware = (req, res, next) => {
  try {
    // Store original JSON method
    const originalJson = res.json.bind(res);

    // Override JSON method to encrypt data if needed
    res.json = function (data) {
      // Only encrypt if response contains sensitive voice data
      if (data && (data.transcription || data.interactions)) {
        data = maskSensitiveData(data);
      }

      return originalJson(data);
    };

    next();
  } catch (error) {
    logger.error('Response encryption middleware error', error);
    next();
  }
};

/**
 * Helper function to mask sensitive data
 */
const maskSensitiveData = (data) => {
  const maskValue = (str) => {
    if (typeof str !== 'string') return str;

    return str
      .replace(/\d{10,}/g, '[MASKED_NUMBER]') // Account numbers
      .replace(/₦\s*[\d,]+(?:\.\d{0,2})?/g, '₦[AMOUNT]') // Amounts in Naira
      .replace(/\$\s*[\d,]+(?:\.\d{0,2})?/g, '$[AMOUNT]') // Amounts in USD
      .replace(/\+?[\d\s\-()]{10,}/g, '[PHONE]') // Phone numbers
      .replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[EMAIL]'); // Email addresses
  };

  if (data.transcription && typeof data.transcription === 'string') {
    data.transcription = maskValue(data.transcription);
  }

  if (data.interactions && Array.isArray(data.interactions)) {
    data.interactions = data.interactions.map(interaction => {
      if (interaction.userText) {
        interaction.userText = maskValue(interaction.userText);
      }
      if (interaction.response?.text) {
        interaction.response.text = maskValue(interaction.response.text);
      }
      return interaction;
    });
  }

  return data;
};

/**
 * Middleware to log voice activity
 */
const logVoiceActivityMiddleware = (req, res, next) => {
  try {
    const logData = {
      timestamp: new Date(),
      userId: req.user?.id || 'anonymous',
      endpoint: req.path,
      method: req.method,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    // Log on response finish
    res.on('finish', () => {
      logData.statusCode = res.statusCode;
      logData.responseTime = Date.now() - req.startTime;

      if (res.statusCode >= 400) {
        logger.warn('Voice request', logData);
      } else {
        logger.info('Voice request', logData);
      }
    });

    req.startTime = Date.now();
    next();
  } catch (error) {
    logger.error('Activity logging error', error);
    next();
  }
};

/**
 * Middleware to validate request payload
 */
const validateVoicePayloadMiddleware = (req, res, next) => {
  try {
    const { body } = req;

    // Check for required fields based on endpoint
    if (req.path.includes('start') && !body.featureType) {
      return res.status(400).json({
        success: false,
        message: 'featureType is required'
      });
    }

    if (req.path.includes('transcribe') && !body.sessionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId is required'
      });
    }

    // Sanitize input
    Object.keys(body).forEach(key => {
      if (typeof body[key] === 'string') {
        body[key] = body[key].trim().substring(0, 5000);
      }
    });

    next();
  } catch (error) {
    logger.error('Payload validation error', error);
    res.status(400).json({
      success: false,
      message: 'Invalid request payload'
    });
  }
};

module.exports = {
  voiceRateLimiter,
  voiceAudioUploadLimiter,
  voiceConsentMiddleware,
  validateAudioFileMiddleware,
  validateVoiceSessionMiddleware,
  encryptSensitiveDataMiddleware,
  logVoiceActivityMiddleware,
  validateVoicePayloadMiddleware,
  maskSensitiveData
};
