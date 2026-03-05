const {
  VoiceService,
  STTService,
  TTSService,
  IntentDetectionService,
  FAQService,
  FinancialCommandHandler
} = require('../services/voice');
const VoiceLog = require('../models/VoiceLog');
const logger = require('../utils/logger');

// Initialize services
const voiceService = new VoiceService();
const sttService = new STTService();
const ttsService = new TTSService();
const intentService = new IntentDetectionService();
const faqService = new FAQService();
const financialCommandHandler = new FinancialCommandHandler();

class VoiceController {
  /**
   * Start voice session
   * POST /api/voice/support/session/start
   */
  async startSession(req, res) {
    try {
      const { featureType = 'SUPPORT' } = req.body;
      const userId = req.user.id;

      // Create session
      const session = voiceService.createSession(userId, featureType);

      // Create voice log for this session
      const voiceLog = new VoiceLog({
        userId,
        sessionId: session.sessionId,
        featureType,
        voiceConsent: {
          required: true,
          consentedAt: new Date(),
          consentMethod: 'IMPLICIT'
        }
      });

      await voiceLog.save();

      logger.info('Voice session started', {
        sessionId: session.sessionId,
        userId,
        featureType
      });

      res.json({
        success: true,
        message: 'Voice session started',
        data: {
          sessionId: session.sessionId,
          expiresIn: session.expiresAt.getTime() - Date.now()
        }
      });
    } catch (error) {
      logger.error('Start session error', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start voice session',
        error: error.message
      });
    }
  }

  /**
   * Transcribe audio
   * POST /api/voice/support/transcribe
   */
  async transcribeAudio(req, res) {
    try {
      const { sessionId, language = 'en' } = req.body;
      const audioBuffer = req.file ? req.file.buffer : null;
      const userId = req.userId;

      // Validate session
      const session = voiceService.getSession(sessionId);
      if (!session) {
        return res.status(400).json({
          success: false,
          message: 'Session not found or expired'
        });
      }

      // Validate audio
      const audioValidation = voiceService.validateAudioFile(req.file);
      if (!audioValidation.valid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid audio file',
          errors: audioValidation.errors
        });
      }

      // Transcribe audio to text using Whisper
      const transcription = await sttService.transcribe(audioBuffer, { language });

      if (!transcription.success) {
        throw new Error('Transcription failed');
      }

      // Check quality
      const quality = sttService.checkTranscriptQuality(transcription.text);

      // Detect intent using enhanced service
      const intentResult = await intentService.detectIntent(transcription.text, {
        featureType: session.featureType,
        userProfile: { language }
      });

      // Extract financial entities
      const entities = intentService.extractFinancialEntities(intentResult, transcription.text);

      // Classify risk level
      const riskLevel = intentService.classifyRiskLevel(intentResult.intent, entities);

      // Determine if confirmation is required
      const requiresConfirmation = intentService.requiresConfirmation(
        intentResult.intent,
        riskLevel,
        intentResult.confidence
      );

      // Generate appropriate response message
      const responseMessage = intentService.generateResponseMessage(
        intentResult.intent,
        entities,
        riskLevel
      );

      // Log interaction
      await voiceService.logInteraction(sessionId, {
        type: 'USER_INPUT',
        userText: transcription.text,
        transcription: {
          text: transcription.text,
          confidence: transcription.confidence,
          provider: transcription.provider
        },
        intent: {
          name: intentResult.intent,
          confidence: intentResult.confidence,
          category: intentResult.category,
          riskLevel,
          requiresConfirmation
        },
        entities
      });

      // For high-risk operations, don't execute immediately
      let executionStatus = null;
      if (riskLevel === 'high' && requiresConfirmation) {
        executionStatus = 'pending_confirmation';
      }

      res.json({
        success: true,
        message: 'Audio transcribed and intent detected',
        data: {
          sessionId,
          transcription: transcription.text,
          confidence: transcription.confidence,
          quality: quality.quality,
          intent: intentResult.intent,
          intentConfidence: intentResult.confidence,
          category: intentResult.category,
          risk: riskLevel,
          requiresConfirmation,
          response: responseMessage,
          entities: entities,
          executionStatus,
          metadata: {
            language,
            method: 'voice',
            provider: 'whisper'
          }
        }
      });
    } catch (error) {
      logger.error('Transcribe error', error);
      res.status(500).json({
        success: false,
        message: 'Transcription failed',
        error: error.message
      });
    }
  }

  /**
   * Get FAQ response and synthesize audio
   * POST /api/voice/support/respond
   */
  async getFAQResponse(req, res) {
    try {
      const { sessionId, userText, intent } = req.body;

      // Validate session
      const session = voiceService.getSession(sessionId);
      if (!session) {
        return res.status(400).json({
          success: false,
          message: 'Session not found or expired'
        });
      }

      // Search FAQs based on intent
      const faqs = faqService.getFAQsByIntent(intent, 5);

      if (faqs.length === 0) {
        // No matching FAQs found
        const responseText = 'I could not find an answer to your question. Please contact our support team for assistance.';

        const ttsResult = await ttsService.synthesize(responseText);

        await voiceService.logInteraction(sessionId, {
          type: 'SYSTEM_RESPONSE',
          response: {
            text: responseText,
            type: 'ESCALATION'
          }
        });

        return res.json({
          success: true,
          message: 'No matching FAQ found',
          data: {
            audio: ttsResult.audio.toString('base64'),
            responseText,
            requiresEscalation: true
          }
        });
      }

      // Get best matching FAQ
      const faq = faqs[0];
      const formattedFAQ = faqService.formatForVoice(faq);

      // Synthesize response
      const responseText = `${formattedFAQ.question}. ${formattedFAQ.summary}`;
      const ttsResult = await ttsService.synthesize(responseText);

      // Log interaction
      await voiceService.logInteraction(sessionId, {
        type: 'SYSTEM_RESPONSE',
        response: {
          text: responseText,
          type: 'FAQ',
          faqId: faq.id
        }
      });

      res.json({
        success: true,
        message: 'FAQ response retrieved',
        data: {
          audio: ttsResult.audio.toString('base64'),
          responseText,
          faqId: faq.id,
          faqCategory: faq.category,
          related: faqService.getRelatedFAQs(faq.id, 2)
        }
      });
    } catch (error) {
      logger.error('Get response error', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get FAQ response',
        error: error.message
      });
    }
  }

  /**
   * End voice session
   * POST /api/voice/support/session/end
   */
  async endSession(req, res) {
    try {
      const { sessionId, reason = 'COMPLETED' } = req.body;

      // Get session
      const session = voiceService.getSession(sessionId);
      if (!session) {
        return res.status(400).json({
          success: false,
          message: 'Session not found'
        });
      }

      // Close session
      voiceService.closeSession(sessionId, reason);

      // Update voice log
      const voiceLog = await VoiceLog.findOne({ sessionId });
      if (voiceLog) {
        voiceLog.status = 'COMPLETED';
        voiceLog.closedReason = reason;
        voiceLog.duration = new Date() - voiceLog.createdAt;
        voiceLog.calculateAnalytics();
        await voiceLog.save();
      }

      const summary = voiceService.getSessionSummary(sessionId);

      logger.info('Voice session ended', summary);

      res.json({
        success: true,
        message: 'Voice session ended',
        data: summary
      });
    } catch (error) {
      logger.error('End session error', error);
      res.status(500).json({
        success: false,
        message: 'Failed to end voice session',
        error: error.message
      });
    }
  }

  /**
   * Search FAQs
   * GET /api/voice/faq/search
   */
  async searchFAQs(req, res) {
    try {
      const { query, category } = req.query;

      const faqs = faqService.searchFAQs(query, category);

      res.json({
        success: true,
        message: 'FAQs retrieved',
        data: {
          count: faqs.length,
          faqs: faqs.map(faq => faqService.formatForVoice(faq))
        }
      });
    } catch (error) {
      logger.error('FAQ search error', error);
      res.status(500).json({
        success: false,
        message: 'FAQ search failed',
        error: error.message
      });
    }
  }

  /**
   * Get FAQ categories
   * GET /api/voice/faq/categories
   */
  async getFAQCategories(req, res) {
    try {
      const categories = faqService.getCategories();

      res.json({
        success: true,
        message: 'FAQ categories retrieved',
        data: {
          categories
        }
      });
    } catch (error) {
      logger.error('Get categories error', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get FAQ categories',
        error: error.message
      });
    }
  }

  /**
   * Get voice consent status
   * GET /api/voice/consent/status
   */
  async getConsentStatus(req, res) {
    try {
      const userId = req.user.id;

      // Check consent in database
      const voiceLog = await VoiceLog.findOne({
        userId,
        'voiceConsent.required': true
      }).sort({ createdAt: -1 });

      const consentGiven = voiceLog?.voiceConsent?.required || false;

      res.json({
        success: true,
        message: 'Consent status retrieved',
        data: {
          consentGiven,
          lastConsentDate: voiceLog?.voiceConsent?.consentedAt
        }
      });
    } catch (error) {
      logger.error('Get consent error', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get consent status',
        error: error.message
      });
    }
  }

  /**
   * Grant voice consent
   * POST /api/voice/consent/grant
   */
  async grantConsent(req, res) {
    try {
      const userId = req.user.id;
      const { consentMethod = 'EXPLICIT' } = req.body;

      // Create a consent record (could be stored in User model or separate collection)
      // For now, we'll create a voice session to record consent
      const voiceLog = new VoiceLog({
        userId,
        sessionId: `consent_${Date.now()}`,
        featureType: 'PROFILE_UPDATE',
        voiceConsent: {
          required: true,
          consentedAt: new Date(),
          consentMethod
        },
        status: 'COMPLETED'
      });

      await voiceLog.save();

      logger.info('Voice consent granted', { userId, consentMethod });

      res.json({
        success: true,
        message: 'Voice consent granted',
        data: {
          consentGiven: true,
          consentDate: voiceLog.voiceConsent.consentedAt
        }
      });
    } catch (error) {
      logger.error('Grant consent error', error);
      res.status(500).json({
        success: false,
        message: 'Failed to grant voice consent',
        error: error.message
      });
    }
  }

  /**
   * Get user voice logs (admin/analytics)
   * GET /api/voice/logs
   */
  async getUserVoiceLogs(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 10, skip = 0 } = req.query;

      const logs = await VoiceLog.find({ userId })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip));

      const total = await VoiceLog.countDocuments({ userId });

      res.json({
        success: true,
        message: 'Voice logs retrieved',
        data: {
          total,
          count: logs.length,
          logs: logs.map(log => ({
            sessionId: log.sessionId,
            featureType: log.featureType,
            status: log.status,
            duration: log.duration,
            interactions: log.interactions.length,
            createdAt: log.createdAt,
            closedAt: log.closedAt
          }))
        }
      });
    } catch (error) {
      logger.error('Get voice logs error', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get voice logs',
        error: error.message
      });
    }
  }

  /**
   * Get voice session details
   * GET /api/voice/session/:sessionId
   */
  async getSessionDetails(req, res) {
    try {
      const { sessionId } = req.params;
      const userId = req.user.id;

      const voiceLog = await VoiceLog.findOne({
        sessionId,
        userId // Security: ensure user can only view their own logs
      });

      if (!voiceLog) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      res.json({
        success: true,
        message: 'Session details retrieved',
        data: {
          sessionId: voiceLog.sessionId,
          featureType: voiceLog.featureType,
          status: voiceLog.status,
          duration: voiceLog.duration,
          interactions: voiceLog.interactions.length,
          analytics: voiceLog.analytics,
          createdAt: voiceLog.createdAt,
          closedAt: voiceLog.closedAt
        }
      });
    } catch (error) {
      logger.error('Get session details error', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get session details',
        error: error.message
      });
    }
  }

  /**
   * Execute a financial command (with confirmation if required)
   * POST /api/voice/support/execute
   */
  async executeFinancialCommand(req, res) {
    try {
      const { sessionId, intent, entities, confirmationToken } = req.body;
      const userId = req.userId;

      // Validate session
      const session = voiceService.getSession(sessionId);
      if (!session) {
        return res.status(400).json({
          success: false,
          message: 'Session not found or expired'
        });
      }

      // Execute the command
      const commandResult = await financialCommandHandler.executeCommand(
        userId,
        intent,
        entities,
        confirmationToken
      );

      // Log the command execution
      await voiceService.logInteraction(sessionId, {
        type: 'COMMAND_EXECUTION',
        command: intent,
        entities,
        result: commandResult,
        timestamp: new Date()
      });

      // Generate response message
      let responseMessage = '';
      if (commandResult.success) {
        responseMessage = commandResult.message;
      } else if (commandResult.requiresConfirmation) {
        responseMessage = `Please confirm this action. ${commandResult.details ? Object.values(commandResult.details).join(', ') : ''}`;
      } else {
        responseMessage = commandResult.error || 'Unable to execute command';
      }

      // Generate audio response
      let audioResponse = null;
      try {
        const audioResult = await ttsService.synthesize(responseMessage, {
          provider: 'openai', // Use OpenAI TTS for voice assistant
          fallback: true
        });

        if (audioResult.success) {
          audioResponse = audioResult.audio.toString('base64');
        }
      } catch (ttsError) {
        logger.warn('TTS synthesis failed:', ttsError.message);
      }

      res.json({
        success: commandResult.success,
        message: responseMessage,
        data: {
          sessionId,
          command: intent,
          result: commandResult,
          audio: audioResponse || null,
          metadata: {
            method: 'voice',
            provider: 'openai',
            timestamp: new Date()
          }
        }
      });
    } catch (error) {
      logger.error('Execute financial command error', error);
      res.status(500).json({
        success: false,
        message: 'Failed to execute command',
        error: error.message
      });
    }
  }

  /**
   * Confirm a pending action (provide PIN/OTP for high-risk operations)
   * POST /api/voice/support/confirm
   */
  async confirmAction(req, res) {
    try {
      const { sessionId, intent, entities, confirmationType, confirmationValue } = req.body;
      const userId = req.userId;

      // Validate session
      const session = voiceService.getSession(sessionId);
      if (!session) {
        return res.status(400).json({
          success: false,
          message: 'Session not found or expired'
        });
      }

      // TODO: Verify PIN/OTP with user service
      // For now, accept the confirmation value as token
      const confirmationToken = confirmationValue;

      // Execute the command with confirmation
      const commandResult = await financialCommandHandler.executeCommand(
        userId,
        intent,
        entities,
        confirmationToken
      );

      // Generate response
      const responseMessage = commandResult.success
        ? commandResult.message
        : commandResult.error || 'Confirmation failed';

      // Generate audio response
      let audioResponse = null;
      try {
        const audioResult = await ttsService.synthesize(responseMessage, {
          provider: 'openai',
          fallback: true
        });

        if (audioResult.success) {
          audioResponse = audioResult.audio.toString('base64');
        }
      } catch (ttsError) {
        logger.warn('TTS synthesis failed:', ttsError.message);
      }

      res.json({
        success: commandResult.success,
        message: responseMessage,
        data: {
          sessionId,
          command: intent,
          result: commandResult,
          audio: audioResponse || null
        }
      });
    } catch (error) {
      logger.error('Confirm action error', error);
      res.status(500).json({
        success: false,
        message: 'Failed to confirm action',
        error: error.message
      });
    }
  }
}

module.exports = new VoiceController();
