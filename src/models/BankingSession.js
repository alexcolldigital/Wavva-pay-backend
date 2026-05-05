const mongoose = require('mongoose');

/**
 * Banking Session Model
 * Tracks hands-free banking sessions with voice commands
 */

const bankingSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    featureType: {
      type: String,
      enum: ['VOICE_BANKING', 'VOICE_FAQ', 'HANDS_FREE_TRANSACTION'],
      default: 'VOICE_BANKING',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'TIMEOUT', 'ERROR'],
      default: 'ACTIVE',
      index: true,
    },

    // Session Metadata
    metadata: {
      device: String,
      platform: String, // WEB, ANDROID, IOS
      ipAddress: String,
      userAgent: String,
      location: String,
    },

    // Voice Consent Tracking
    voiceConsent: {
      required: {
        type: Boolean,
        default: false,
      },
      consentedAt: Date,
      consentMethod: String, // EXPLICIT, IMPLICIT
    },

    // Active Transaction in Session
    activeTransaction: {
      transactionId: String,
      type: String,
      status: String,
      startedAt: Date,
      lastInteractionAt: Date,
    },

    // Voice Commands and Interactions
    interactions: [
      {
        timestamp: Date,
        type: String, // 'VOICE_COMMAND', 'CONFIRMATION', 'BIOMETRIC', 'RESPONSE'
        voiceCommand: String,
        audioUrl: String,
        audioDataUrl: String,
        transcription: {
          text: String,
          confidence: Number,
          language: String,
        },
        intent: {
          name: String,
          confidence: Number,
          parameters: mongoose.Schema.Types.Mixed,
        },
        response: {
          text: String,
          audioUrl: String,
          type: String, // FAQ, TRANSACTION_CONFIRMATION, ERROR
        },
        duration: Number, // milliseconds
        success: Boolean,
        error: String,
      },
    ],

    // Commands Parsed in Session
    parsedCommands: [
      {
        timestamp: Date,
        rawCommand: String,
        intent: String,
        extractedData: mongoose.Schema.Types.Mixed,
        confidence: Number,
        validationResult: mongoose.Schema.Types.Mixed,
      },
    ],

    // Biometric Verifications in Session
    biometricVerifications: [
      {
        timestamp: Date,
        method: String, // FINGERPRINT, FACE_RECOGNITION, PIN, OTP
        sessionId: String,
        result: String, // SUCCESS, FAILED, TIMEOUT
        attempts: Number,
        confidence: Number,
      },
    ],

    // Transactions Processed in Session
    transactionsProcessed: [
      {
        transactionId: String,
        type: String,
        amount: Number,
        status: String,
        timestamp: Date,
      },
    ],

    // Session Analytics
    analytics: {
      totalCommands: Number,
      successfulCommands: Number,
      failedCommands: Number,
      totalInteractions: Number,
      successfulTransactions: Number,
      failedTransactions: Number,
      averageIntentConfidence: Number,
      averageTranscriptionConfidence: Number,
      totalVoiceTime: Number, // milliseconds
      totalSessionDuration: Number,
    },

    // Error Tracking
    errors: [
      {
        timestamp: Date,
        errorType: String,
        message: String,
        component: String,
        recoverable: Boolean,
      },
    ],

    // Session Lifecycle
    startedAt: {
      type: Date,
      default: Date.now,
    },
    closedAt: Date,
    closureReason: String,
    timeoutAt: Date,

    // Encryption Support
    encryption: {
      encrypted: {
        type: Boolean,
        default: false,
      },
      algorithm: String,
      iv: String,
      authTag: String,
    },

    // Audit Log
    auditLog: [
      {
        event: String,
        timestamp: Date,
        actor: String,
        changes: mongoose.Schema.Types.Mixed,
        reason: String,
      },
    ],
  },
  {
    timestamps: true,
    collection: 'banking_sessions',
  }
);

// Indexes
bankingSessionSchema.index({ userId: 1, createdAt: -1 });
bankingSessionSchema.index({ status: 1, createdAt: -1 });
bankingSessionSchema.index({ featureType: 1, createdAt: -1 });
bankingSessionSchema.index({ sessionId: 1 });

// TTL Index: Auto-delete old sessions after 90 days (GDPR compliance)
bankingSessionSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 7776000, // 90 days
  }
);

// Methods

/**
 * Add interaction to session
 */
bankingSessionSchema.methods.addInteraction = function(interaction) {
  this.interactions.push({
    timestamp: new Date(),
    ...interaction,
  });
  return this.save();
};

/**
 * Add parsed command to session
 */
bankingSessionSchema.methods.addParsedCommand = function(
  command,
  intent,
  extractedData,
  confidence,
  validationResult
) {
  this.parsedCommands.push({
    timestamp: new Date(),
    rawCommand: command,
    intent,
    extractedData,
    confidence,
    validationResult,
  });
  return this.save();
};

/**
 * Add biometric verification to session
 */
bankingSessionSchema.methods.addBiometricVerification = function(
  method,
  sessionId,
  result,
  attempts,
  confidence
) {
  this.biometricVerifications.push({
    timestamp: new Date(),
    method,
    sessionId,
    result,
    attempts,
    confidence,
  });
  return this.save();
};

/**
 * Add transaction to session
 */
bankingSessionSchema.methods.addTransaction = function(
  transactionId,
  type,
  amount,
  status
) {
  this.transactionsProcessed.push({
    transactionId,
    type,
    amount,
    status,
    timestamp: new Date(),
  });

  this.activeTransaction = {
    transactionId,
    type,
    status,
    startedAt: new Date(),
    lastInteractionAt: new Date(),
  };

  return this.save();
};

/**
 * Close session
 */
bankingSessionSchema.methods.closeSession = function(reason = 'User ended session') {
  this.status = 'COMPLETED';
  this.closedAt = new Date();
  this.closureReason = reason;

  // Calculate analytics
  this.calculateAnalytics();

  this.addAuditEntry('SESSION_CLOSED', 'system', { reason }, reason);
  return this.save();
};

/**
 * Calculate session analytics
 */
bankingSessionSchema.methods.calculateAnalytics = function() {
  const interactions = this.interactions || [];
  const commands = this.parsedCommands || [];
  const transactions = this.transactionsProcessed || [];

  this.analytics = {
    totalCommands: commands.length,
    successfulCommands: commands.filter((c) => c.confidence > 0.7).length,
    failedCommands: commands.filter((c) => c.confidence <= 0.7).length,
    totalInteractions: interactions.length,
    successfulTransactions: transactions.filter((t) => t.status === 'COMPLETED').length,
    failedTransactions: transactions.filter((t) => t.status === 'FAILED').length,
    averageIntentConfidence:
      commands.reduce((sum, c) => sum + (c.confidence || 0), 0) / commands.length ||
      0,
    averageTranscriptionConfidence:
      interactions.reduce((sum, i) => sum + (i.transcription?.confidence || 0), 0) /
        interactions.length || 0,
    totalVoiceTime: interactions.reduce((sum, i) => sum + (i.duration || 0), 0),
    totalSessionDuration: this.closedAt
      ? this.closedAt.getTime() - this.startedAt.getTime()
      : Date.now() - this.startedAt.getTime(),
  };
};

/**
 * Mask sensitive data
 */
bankingSessionSchema.methods.maskSensitiveData = function() {
  const masked = this.toObject();

  // Mask account numbers
  if (masked.interactions) {
    masked.interactions.forEach((interaction) => {
      if (interaction.response?.text) {
        interaction.response.text = interaction.response.text.replace(
          /\b\d{10,}\b/g,
          '[MASKED_NUMBER]'
        );
      }
    });
  }

  return masked;
};

/**
 * Add audit entry
 */
bankingSessionSchema.methods.addAuditEntry = function(event, actor, changes = {}, reason = '') {
  this.auditLog.push({
    event,
    timestamp: new Date(),
    actor,
    changes,
    reason,
  });
  return this.save();
};

// Statics

/**
 * Get user sessions
 */
bankingSessionSchema.statics.getUserSessions = function(userId, options = {}) {
  const {
    status,
    featureType,
    startDate,
    endDate,
    page = 1,
    limit = 20,
  } = options;

  let query = { userId };

  if (status) query.status = status;
  if (featureType) query.featureType = featureType;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .exec();
};

/**
 * Get sessions for date range
 */
bankingSessionSchema.statics.getSessionsForDateRange = function(
  startDate,
  endDate
) {
  return this.find({
    createdAt: { $gte: startDate, $lte: endDate },
  }).exec();
};

/**
 * Get compliance report
 */
bankingSessionSchema.statics.getComplianceReport = function(
  startDate,
  endDate
) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$userId',
        totalSessions: { $sum: 1 },
        completedSessions: {
          $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
        },
        totalTransactions: {
          $sum: { $size: { $ifNull: ['$transactionsProcessed', []] } },
        },
        totalInteractions: {
          $sum: { $size: { $ifNull: ['$interactions', []] } },
        },
      },
    },
  ]);
};

// Pre-save middleware
bankingSessionSchema.pre('save', function(next) {
  // Add initial audit entry if new
  if (this.isNew) {
    this.auditLog.push({
      event: 'SESSION_CREATED',
      timestamp: new Date(),
      actor: 'system',
      reason: 'Session initiated',
    });
  }

  next();
});

const BankingSession = mongoose.model('BankingSession', bankingSessionSchema);

module.exports = BankingSession;
