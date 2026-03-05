const mongoose = require('mongoose');

const voiceLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    featureType: {
      type: String,
      enum: ['SUPPORT', 'BANKING', 'PROFILE_UPDATE'],
      default: 'SUPPORT',
      index: true
    },
    voiceConsent: {
      required: Boolean,
      consentedAt: Date,
      consentMethod: String
    },
    interactions: [
      {
        timestamp: Date,
        type: {
          type: String,
          enum: ['USER_INPUT', 'SYSTEM_RESPONSE', 'INTENT_DETECTION', 'FAQ_SEARCH', 'ERROR']
        },
        userText: String,
        audioUrl: String, // URL to stored audio
        transcription: {
          text: String,
          confidence: Number,
          provider: String
        },
        intent: {
          name: String,
          confidence: Number,
          category: String
        },
        response: {
          text: String,
          audioUrl: String,
          type: String, // 'FAQ', 'SYSTEM', 'ESCALATION'
        },
        timeSpent: Number // milliseconds
      }
    ],
    // Encryption metadata
    encryption: {
      encrypted: Boolean,
      algorithm: String, // 'AES-256-GCM'
      encryptedInteractions: String,
      iv: Buffer,
      authTag: Buffer
    },
    metadata: {
      language: String,
      device: String, // 'WEB', 'MOBILE', 'TABLET'
      ipAddress: String, // hashed for privacy
      userAgent: String
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'ESCALATED', 'FAILED'],
      default: 'ACTIVE'
    },
    closedReason: String,
    duration: Number, // in milliseconds
    analytics: {
      totalInteractions: Number,
      successCount: Number,
      errorCount: Number,
      faqsAccessed: [
        {
          faqId: String,
          faqQuestion: String,
          responseUseful: Boolean
        }
      ],
      intentDetectionAccuracy: Number, // 0-1
      audioQuality: String // EXCELLENT, GOOD, FAIR, POOR
    },
    // Audit trail
    auditLog: [
      {
        timestamp: Date,
        action: String,
        details: String
      }
    ]
  },
  {
    timestamps: true,
    collection: 'voiceLogs'
  }
);

// Indexes for efficient querying
voiceLogSchema.index({ userId: 1, createdAt: -1 });
voiceLogSchema.index({ featureType: 1, createdAt: -1 });
voiceLogSchema.index({ 'interactions.intent.name': 1 });
voiceLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days retention

// Pre-save middleware for audit logging
voiceLogSchema.pre('save', function (next) {
  if (!this.auditLog) {
    this.auditLog = [];
  }

  this.auditLog.push({
    timestamp: new Date(),
    action: 'save',
    details: 'Voice log saved'
  });

  next();
});

// Method to add audit entry
voiceLogSchema.methods.addAuditEntry = function (action, details) {
  if (!this.auditLog) {
    this.auditLog = [];
  }

  this.auditLog.push({
    timestamp: new Date(),
    action,
    details
  });

  return this.save();
};

// Method to mask sensitive data
voiceLogSchema.methods.maskSensitiveData = function () {
  const maskValue = (str) => {
    if (!str) return str;
    return str.replace(/\d{10,}/g, '[MASKED]')
      .replace(/₦\s*[\d,]+/g, '[AMOUNT]')
      .replace(/\+?[\d\s\-()]{10,}/g, '[PHONE]');
  };

  if (this.interactions) {
    this.interactions.forEach(interaction => {
      if (interaction.userText) {
        interaction.userText = maskValue(interaction.userText);
      }
      if (interaction.response && interaction.response.text) {
        interaction.response.text = maskValue(interaction.response.text);
      }
    });
  }

  return this;
};

// Method to calculate analytics
voiceLogSchema.methods.calculateAnalytics = function () {
  if (!this.interactions || this.interactions.length === 0) {
    return;
  }

  this.analytics = {
    totalInteractions: this.interactions.length,
    successCount: this.interactions.filter(i => i.type !== 'ERROR').length,
    errorCount: this.interactions.filter(i => i.type === 'ERROR').length,
    faqsAccessed: this.interactions
      .filter(i => i.response && i.response.type === 'FAQ')
      .map(i => ({
        faqId: i.response.faqId,
        faqQuestion: i.response.faqQuestion,
        responseUseful: i.response.responseUseful
      })),
    intentDetectionAccuracy: this.interactions
      .filter(i => i.intent)
      .reduce((sum, i) => sum + (i.intent.confidence || 0), 0) / 
      this.interactions.filter(i => i.intent).length || 0
  };

  return this;
};

// Statics for querying
voiceLogSchema.statics.getUserSessions = function (userId) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

voiceLogSchema.statics.getSessionsForDateRange = function (startDate, endDate) {
  return this.find({
    createdAt: { $gte: startDate, $lte: endDate }
  });
};

voiceLogSchema.statics.getComplianceReport = function (startDate, endDate, featureType) {
  return this.find({
    createdAt: { $gte: startDate, $lte: endDate },
    ...(featureType && { featureType })
  });
};

module.exports = mongoose.model('VoiceLog', voiceLogSchema);
