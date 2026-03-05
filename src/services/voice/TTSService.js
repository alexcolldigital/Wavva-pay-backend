const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

class TTSService {
  constructor(provider = 'openai') {
    this.provider = provider;
    this.lang = process.env.VOICE_LANGUAGE || 'en';
    this.apiKey = process.env.OPENAI_API_KEY;
    this.voice = process.env.OPENAI_TTS_VOICE || 'nova'; // alloy, echo, fable, onyx, nova, shimmer
    logger.info(`TTSService initialized with provider: ${provider}`);
  }

  /**
   * Convert text to speech using OpenAI TTS
   */
  async synthesizeWithOpenAI(text, options = {}) {
    try {
      const {
        voice = this.voice,
        speed = 1.0
      } = options;

      if (!text || text.trim().length === 0) {
        throw new Error('Text is required for TTS');
      }

      if (!this.apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      // Limit text length
      if (text.length > 4096) {
        throw new Error('Text exceeds maximum length of 4096 characters for OpenAI TTS');
      }

      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: this.apiKey
      });

      // Create speech using OpenAI
      const mp3 = await openai.audio.speech.create({
        model: 'tts-1-hd', // High quality
        voice: voice,
        input: text,
        speed: Math.min(Math.max(speed, 0.25), 4.0), // Clamp between 0.25 and 4.0
        response_format: 'mp3'
      });

      // Convert response to buffer
      const buffer = await mp3.arrayBuffer();
      const audioBuffer = Buffer.from(buffer);

      logger.info('Audio synthesized successfully with OpenAI', {
        textLength: text.length,
        voice,
        speed
      });

      return {
        success: true,
        audio: audioBuffer,
        mimeType: 'audio/mpeg',
        provider: 'openai',
        voice,
        speed,
        textLength: text.length
      };
    } catch (error) {
      logger.error('OpenAI TTS synthesis failed', error);
      throw new Error(`OpenAI TTS synthesis failed: ${error.message}`);
    }
  }

  /**
   * Convert text to speech using Google TTS
   */
  async synthesizeWithGTTS(text, options = {}) {
    try {
      const {
        language = this.lang,
        slow = false
      } = options;

      if (!text || text.trim().length === 0) {
        throw new Error('Text is required for TTS');
      }

      // Limit text length
      if (text.length > 5000) {
        throw new Error('Text exceeds maximum length of 5000 characters');
      }

      const audioPath = path.join(__dirname, `../../../temp/tts_${Date.now()}.mp3`);
      const audioDir = path.dirname(audioPath);

      // Ensure temp directory exists
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }

      const gtts = new gTTS(text, { lang: language, slow });

      return new Promise((resolve, reject) => {
        gtts.save(audioPath, (error) => {
          if (error) {
            logger.error('gTTS synthesis error', error);
            return reject(error);
          }

          try {
            const audioBuffer = fs.readFileSync(audioPath);
            fs.unlinkSync(audioPath);

            logger.info('Audio synthesized successfully', {
              textLength: text.length,
              language
            });

            resolve({
              success: true,
              audio: audioBuffer,
              mimeType: 'audio/mpeg',
              provider: 'gtts',
              language,
              textLength: text.length
            });
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (error) {
      logger.error('TTS synthesis failed', error);
      throw new Error(`TTS synthesis failed: ${error.message}`);
    }
  }

  /**
   * Synthesize speech (automatic provider selection)
   */
  async synthesize(text, options = {}) {
    const {
      provider = this.provider,
      fallback = true,
      ...synthesizeOptions
    } = options;

    try {
      if (!text) {
        throw new Error('Text is required');
      }

      let result;

      switch (provider.toLowerCase()) {
        case 'openai':
        case 'gpt':
          result = await this.synthesizeWithOpenAI(text, synthesizeOptions);
          break;

        case 'gtts':
        case 'google':
          result = await this.synthesizeWithGTTS(text, synthesizeOptions);
          break;

        default:
          // Default to OpenAI, fallback to Google
          try {
            result = await this.synthesizeWithOpenAI(text, synthesizeOptions);
          } catch (error) {
            logger.warn('OpenAI TTS failed, falling back to Google TTS:', error.message);
            if (fallback) {
              result = await this.synthesizeWithGTTS(text, synthesizeOptions);
            } else {
              throw error;
            }
          }
      }

      return {
        ...result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('TTS error', error);
      throw error;
    }
  }

  /**
   * Break long text into chunks for synthesis
   */
  breakTextIntoChunks(text, maxLength = 500) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxLength) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Synthesize long text by breaking into chunks
   */
  async synthesizeLongText(text, options = {}) {
    try {
      const chunks = this.breakTextIntoChunks(text);
      const audioBuffers = [];

      for (const chunk of chunks) {
        const result = await this.synthesize(chunk, options);
        audioBuffers.push(result.audio);
      }

      // Combine audio buffers
      const combinedBuffer = Buffer.concat(audioBuffers);

      logger.info('Long text synthesized', {
        chunkCount: chunks.length,
        totalLength: text.length
      });

      return {
        success: true,
        audio: combinedBuffer,
        mimeType: 'audio/mpeg',
        provider: this.provider,
        chunkCount: chunks.length
      };
    } catch (error) {
      logger.error('Long text synthesis failed', error);
      throw error;
    }
  }

  /**
   * Convert text to audio stream
   */
  async getAudioStream(text, options = {}) {
    const result = await this.synthesize(text, options);
    return result.audio;
  }

  /**
   * Check if text needs synthesis
   */
  shouldSynthesize(text, options = {}) {
    const {
      minLength = 1,
      maxLength = 5000,
      requiresAudio = true
    } = options;

    if (!requiresAudio) {
      return false;
    }

    if (!text) {
      return false;
    }

    const textLength = text.length;

    return textLength >= minLength && textLength <= maxLength;
  }

  /**
   * Format text for better audio synthesis
   */
  formatTextForSynthesis(text) {
    // Remove special characters but preserve punctuation
    text = text.replace(/[^\w\s.!?,;:'-]/g, '');

    // Replace common abbreviations for better pronunciation
    const abbreviations = {
      'NGN': 'Nigerian Naira',
      'USD': 'US Dollar',
      'GBP': 'British Pound',
      'ATM': 'ATM',
      'PIN': 'PIN',
      'OTP': 'OTP',
      'FAQ': 'FAQ',
      'ID': 'ID'
    };

    Object.entries(abbreviations).forEach(([abbr, full]) => {
      text = text.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
    });

    // Replace monetary units for better pronunciation
    text = text.replace(/₦\s*[\d,]+/g, (match) => {
      const amount = match.replace(/₦\s*/g, '');
      return `Nigerian Naira ${amount}`;
    });

    text = text.replace(/\$\s*[\d,]+/g, (match) => {
      const amount = match.replace(/\$\s*/g, '');
      return `${amount} dollars`;
    });

    return text;
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
      'fr': { name: 'French', region: 'FR' },
      'pt': { name: 'Portuguese', region: 'PT' }
    };
  }
}

module.exports = TTSService;
