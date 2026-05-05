const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const {
  voiceRateLimiter,
  voiceConsentMiddleware,
  validateAudioFileMiddleware,
  validateVoiceSessionMiddleware,
  logVoiceActivityMiddleware
} = require('../middleware/voiceMiddleware');
const voiceController = require('../controllers/voiceController');

const router = express.Router();

// Configure multer for audio file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

// Apply authentication and rate limiting to all voice routes
router.use(auth);
router.use(voiceRateLimiter);
router.use(logVoiceActivityMiddleware);

/**
 * Session Management Routes
 */

/**
 * @route   POST /api/voice/support/session/start
 * @desc    Start a new voice session
 * @access  Private
 * @body    { featureType: 'SUPPORT'|'BANKING'|'PROFILE_UPDATE' }
 * @returns { sessionId, expiresIn }
 */
router.post('/support/session/start', voiceConsentMiddleware, async (req, res) => {
  voiceController.startSession(req, res);
});

/**
 * @route   POST /api/voice/support/session/end
 * @desc    End a voice session
 * @access  Private
 * @body    { sessionId, reason: 'COMPLETED'|'CANCELLED'|'ERROR' }
 * @returns { sessionId, duration, interactions }
 */
router.post('/support/session/end', validateVoiceSessionMiddleware, async (req, res) => {
  voiceController.endSession(req, res);
});

/**
 * @route   GET /api/voice/session/:sessionId
 * @desc    Get session details
 * @access  Private
 * @params  { sessionId }
 * @returns { sessionId, featureType, status, duration, interactions, analytics }
 */
router.get('/session/:sessionId', async (req, res) => {
  voiceController.getSessionDetails(req, res);
});

/**
 * Audio Processing Routes
 */

/**
 * @route   POST /api/voice/support/transcribe
 * @desc    Transcribe audio to text
 * @access  Private
 * @body    { sessionId, language: 'en'|'ha'|'yo'|'ig'|'fr' }
 * @files   { audio file }
 * @returns { transcription, confidence, quality, intent, intentConfidence }
 */
router.post(
  '/support/transcribe',
  upload.single('audio'),
  validateAudioFileMiddleware,
  validateVoiceSessionMiddleware,
  async (req, res) => {
    voiceController.transcribeAudio(req, res);
  }
);

/**
 * @route   POST /api/voice/support/respond
 * @desc    Get FAQ response and synthesize audio
 * @access  Private
 * @body    { sessionId, userText, intent }
 * @returns { audio: base64, responseText, faqId, faqCategory, related }
 */
router.post('/support/respond', validateVoiceSessionMiddleware, async (req, res) => {
  voiceController.getFAQResponse(req, res);
});

/**
 * FAQ Routes
 */

/**
 * @route   GET /api/voice/faq/search
 * @desc    Search FAQs
 * @access  Private
 * @query   { query: string, category: string }
 * @returns { count, faqs: [{ id, question, answer, summary, category }] }
 */
router.get('/faq/search', async (req, res) => {
  voiceController.searchFAQs(req, res);
});

/**
 * @route   GET /api/voice/faq/categories
 * @desc    Get FAQ categories
 * @access  Private
 * @returns { categories: [] }
 */
router.get('/faq/categories', async (req, res) => {
  voiceController.getFAQCategories(req, res);
});

/**
 * Consent Routes
 */

/**
 * @route   GET /api/voice/consent/status
 * @desc    Get voice consent status
 * @access  Private
 * @returns { consentGiven: boolean, lastConsentDate: Date }
 */
router.get('/consent/status', async (req, res) => {
  voiceController.getConsentStatus(req, res);
});

/**
 * @route   POST /api/voice/consent/grant
 * @desc    Grant voice feature consent
 * @access  Private
 * @body    { consentMethod: 'EXPLICIT'|'IMPLICIT' }
 * @returns { consentGiven: boolean, consentDate: Date }
 */
router.post('/consent/grant', async (req, res) => {
  voiceController.grantConsent(req, res);
});

/**
 * Financial Command Routes
 */

/**
 * @route   POST /api/voice/support/execute
 * @desc    Execute a financial command (with confirmation if high-risk)
 * @access  Private
 * @body    { sessionId, intent, entities, confirmationToken }
 * @returns { success, message, result, audio (base64) }
 */
router.post('/support/execute', validateVoiceSessionMiddleware, async (req, res) => {
  voiceController.executeFinancialCommand(req, res);
});

/**
 * @route   POST /api/voice/support/confirm
 * @desc    Confirm a pending financial action (provide PIN/OTP)
 * @access  Private
 * @body    { sessionId, intent, entities, confirmationType, confirmationValue }
 * @returns { success, message, result, audio (base64) }
 */
router.post('/support/confirm', validateVoiceSessionMiddleware, async (req, res) => {
  voiceController.confirmAction(req, res);
});

/**
 * Analytics Routes
 */

/**
 * @route   GET /api/voice/logs
 * @desc    Get user voice activity logs
 * @access  Private
 * @query   { limit: 10, skip: 0 }
 * @returns { total, count, logs: [{ sessionId, featureType, status, duration, interactions, createdAt }] }
 */
router.get('/logs', async (req, res) => {
  voiceController.getUserVoiceLogs(req, res);
});

/**
 * Health Check Route
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Voice service is operational',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
