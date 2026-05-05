const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

class STTService {
  constructor(provider = 'whisper') {
    this.provider = provider;
    this.apiKey = process.env.OPENAI_API_KEY;
    logger.info(`STTService initialized with provider: ${provider}`);
  }

  /**
   * Transcribe audio using Whisper API
   */
  async transcribeWithWhisper(audioBuffer, language = 'en') {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: this.apiKey
      });

      // Create a temporary file for the audio buffer
      const tempPath = path.join(__dirname, `../../../temp/audio_${Date.now()}.wav`);
      
      // Ensure temp directory exists
      const tempDir = path.dirname(tempPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      fs.writeFileSync(tempPath, audioBuffer);

      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1',
        language: language,
        temperature: 0.5,
        response_format: 'json'
      });

      // Clean up temp file
      fs.unlinkSync(tempPath);

      logger.info('Audio transcribed successfully', {
        duration: transcription.duration,
        language
      });

      return {
        success: true,
        text: transcription.text,
        confidence: transcription.confidence || 0.95,
        language: language,
        provider: 'whisper'
      };
    } catch (error) {
      logger.error('Whisper transcription failed', error);
      throw new Error(`STT transcription failed: ${error.message}`);
    }
  }

  /**
   * Fallback to Web Speech API (client-side)
   * This is actually handled on the frontend, but included for reference
   */
  async transcribeWithWebSpeech(audioBuffer, language = 'en') {
    logger.warn('Web Speech API should be called from client-side');
    return {
      success: true,
      text: '',
      confidence: 0,
      language,
      provider: 'web-speech',
      warning: 'Use client-side Web Speech API instead'
    };
  }

  /**
   * Transcribe audio (automatic provider selection)
   */
  async transcribe(audioBuffer, options = {}) {
    const {
      language = 'en',
      provider = this.provider
    } = options;

    try {
      if (!audioBuffer) {
        throw new Error('Audio buffer is required');
      }

      let result;

      switch (provider.toLowerCase()) {
        case 'whisper':
          result = await this.transcribeWithWhisper(audioBuffer, language);
          break;

        case 'web-speech':
        case 'client':
          result = await this.transcribeWithWebSpeech(audioBuffer, language);
          break;

        default:
          throw new Error(`Unknown STT provider: ${provider}`);
      }

      return {
        ...result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('STT error', error);
      throw error;
    }
  }

  /**
   * Check transcript quality
   */
  checkTranscriptQuality(transcript) {
    const issues = [];

    if (!transcript) {
      issues.push('Empty transcript');
      return { quality: 'VERY_LOW', confidence: 0, issues };
    }

    if (transcript.length < 3) {
      issues.push('Transcript too short');
    }

    if (transcript.length > 500) {
      issues.push('Transcript too long');
    }

    // Check for common noise patterns
    const noisePhrases = ['um', 'uh', 'mmm', 'huh'];
    let noiseCount = 0;
    noisePhrases.forEach(phrase => {
      if (transcript.toLowerCase().includes(phrase)) {
        noiseCount++;
      }
    });

    if (noiseCount > 3) {
      issues.push('Excessive background noise detected');
    }

    // Determine quality
    let quality = 'HIGH';
    let confidence = 0.95;

    if (issues.length > 0) {
      quality = 'MEDIUM';
      confidence = 0.7;
    }

    if (issues.length > 2) {
      quality = 'LOW';
      confidence = 0.5;
    }

    if (transcript.length < 3) {
      quality = 'VERY_LOW';
      confidence = 0.2;
    }

    return { quality, confidence, issues };
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return {
      'en': { name: 'English', region: 'US' },
      'ha': { name: 'Hausa', region: 'NG' },
      'yo': { name: 'Yoruba', region: 'NG' },
      'ig': { name: 'Igbo', region: 'NG' },
      'fr': { name: 'French', region: 'FR' }
    };
  }

  /**
   * Detect language from audio (requires Whisper API)
   */
  async detectLanguage(audioBuffer) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: this.apiKey
      });

      const tempPath = path.join(__dirname, `../../../temp/audio_${Date.now()}.wav`);
      const tempDir = path.dirname(tempPath);
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      fs.writeFileSync(tempPath, audioBuffer);

      const result = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1'
      });

      fs.unlinkSync(tempPath);

      return {
        language: result.language || 'unknown',
        confidence: 0.9
      };
    } catch (error) {
      logger.error('Language detection failed', error);
      return {
        language: 'unknown',
        confidence: 0
      };
    }
  }
}

module.exports = STTService;
