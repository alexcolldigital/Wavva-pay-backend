const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

class VoiceService {
  constructor(config = {}) {
    this.config = {
      sttProvider: process.env.STT_PROVIDER || 'whisper',
      ttsProvider: process.env.TTS_PROVIDER || 'gtts',
      llmProvider: process.env.LLM_PROVIDER || 'openai',
      maxAudioDuration: parseInt(process.env.VOICE_MAX_AUDIO_DURATION || '30'),
      sessionTimeout: parseInt(process.env.VOICE_SESSION_TIMEOUT || '1800'),
      ...config
    };

    this.activeSessions = new Map();
    logger.info('VoiceService initialized', this.config);
  }

  /**
   * Create a new voice session
   */
  async createSession(userId, featureType = 'SUPPORT') {
    const sessionId = uuidv4();
    const session = {
      sessionId,
      userId,
      featureType,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.sessionTimeout * 1000),
      status: 'ACTIVE',
      interactions: []
    };

    this.activeSessions.set(sessionId, session);
    logger.info(`Voice session created: ${sessionId} for user: ${userId}`);

    return session;
  }

  /**
   * Get active session
   */
  getSession(sessionId) {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      return null;
    }

    if (new Date() > session.expiresAt) {
      this.activeSessions.delete(sessionId);
      logger.info(`Voice session expired: ${sessionId}`);
      return null;
    }

    return session;
  }

  /**
   * Update session
   */
  updateSession(sessionId, updates) {
    const session = this.getSession(sessionId);

    if (!session) {
      throw new Error('Session not found or expired');
    }

    Object.assign(session, updates);
    logger.debug(`Session updated: ${sessionId}`, updates);

    return session;
  }

  /**
   * Close session
   */
  closeSession(sessionId, reason = 'COMPLETED') {
    const session = this.activeSessions.get(sessionId);

    if (session) {
      session.status = 'CLOSED';
      session.closedAt = new Date();
      session.closeReason = reason;
      logger.info(`Voice session closed: ${sessionId} (${reason})`);
    }
  }

  /**
   * Log voice interaction
   */
  async logInteraction(sessionId, data) {
    const session = this.getSession(sessionId);

    if (!session) {
      throw new Error('Session not found');
    }

    const interaction = {
      timestamp: new Date(),
      ...data
    };

    session.interactions.push(interaction);
    logger.debug(`Interaction logged in session: ${sessionId}`);

    return interaction;
  }

  /**
   * Validate audio file
   */
  validateAudioFile(file) {
    const errors = [];

    if (!file) {
      errors.push('No audio file provided');
    }

    if (file && file.size === 0) {
      errors.push('Audio file is empty');
    }

    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (file && file.size > maxSizeBytes) {
      errors.push(`Audio file exceeds ${maxSizeBytes / 1024 / 1024}MB limit`);
    }

    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'];
    if (file && !allowedTypes.includes(file.mimetype)) {
      errors.push(`Audio format not supported: ${file.mimetype}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Mask sensitive data in response
   */
  maskSensitiveData(text, maskType = 'full') {
    if (maskType === 'none') {
      return text;
    }

    // Mask account numbers
    text = text.replace(/\d{10,}/g, '[ACCOUNT_NUMBER]');

    // Mask amounts (keep only first and last digit)
    text = text.replace(/₦\s*[\d,]+(?:\.\d{0,2})?/g, '₦ [AMOUNT]');

    // Mask phone numbers
    text = text.replace(/\+?[\d\s\-()]{10,}/g, '[PHONE_NUMBER]');

    // Mask email addresses
    text = text.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[EMAIL]');

    // Mask transaction IDs
    text = text.replace(/WVA-[\w\d]{10,}/g, '[TRANSACTION_ID]');

    return text;
  }

  /**
   * Get summary of session for logging
   */
  getSessionSummary(sessionId) {
    const session = this.getSession(sessionId);

    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      userId: session.userId,
      featureType: session.featureType,
      status: session.status,
      duration: (session.closedAt || new Date()) - session.createdAt,
      interactionCount: session.interactions.length,
      createdAt: session.createdAt,
      closedAt: session.closedAt
    };
  }
}

module.exports = VoiceService;
