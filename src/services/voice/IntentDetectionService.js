const logger = require('../../utils/logger');

class IntentDetectionService {
  constructor(provider = 'openai') {
    this.provider = provider;
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.LLM_MODEL || 'gpt-3.5-turbo';
    logger.info(`IntentDetectionService initialized with provider: ${provider}`);
  }

  /**
   * Detect intent from user text using OpenAI
   */
  async detectIntentWithOpenAI(userText, context = {}) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: this.apiKey
      });

      const systemPrompt = this.buildSystemPrompt(context);

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userText
          }
        ],
        temperature: 0.3,
        max_tokens: 200,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0].message.content;
      const result = JSON.parse(content);

      logger.info('Intent detected', {
        intent: result.intent,
        confidence: result.confidence
      });

      return {
        success: true,
        intent: result.intent,
        confidence: result.confidence || 0.8,
        category: result.category,
        entities: result.entities || {},
        clarificationNeeded: result.clarificationNeeded || false,
        provider: 'openai'
      };
    } catch (error) {
      logger.error('Intent detection error', error);
      throw new Error(`Intent detection failed: ${error.message}`);
    }
  }

  /**
   * Detect intent (automatic provider selection)
   */
  async detectIntent(userText, context = {}) {
    try {
      if (!userText || userText.trim().length === 0) {
        throw new Error('User text is required for intent detection');
      }

      let result;

      switch (this.provider.toLowerCase()) {
        case 'openai':
        case 'gpt':
          result = await this.detectIntentWithOpenAI(userText, context);
          break;

        default:
          throw new Error(`Unknown intent provider: ${this.provider}`);
      }

      return {
        ...result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Intent detection error', error);
      throw error;
    }
  }

  /**
   * Build system prompt for intent detection
   */
  buildSystemPrompt(context = {}) {
    const { featureType = 'SUPPORT', userProfile = {} } = context;

    return `You are a secure fintech voice assistant for Wavva Pay.

Your responsibilities:
1. Understand the user's request.
2. Identify the intent.
3. Extract relevant entities.
4. Generate a short, clear response.
5. Classify the risk level.
6. Never execute any financial action.

Supported intents:
- check_balance: Check wallet balance
- recent_transactions: View transaction history
- send_money: Transfer funds to another user
- transfer_status: Check status of a transfer
- reset_pin: Reset security PIN
- request_money: Request money from someone
- bill_payment: Pay bills or airtime
- faq: General FAQ questions
- speak_to_agent: Request human support
- unknown: Unable to determine intent

Risk levels:
- low: Information requests only (balance, FAQ, status)
- medium: Sensitive information access
- high: Financial transactions (transfers, payments)

Rules:
- Always return valid JSON.
- Never assume missing financial details without asking.
- Ask for clarification if information is incomplete.
- Any financial action (high risk) requires explicit user confirmation.
- Do not reveal sensitive information (full account numbers, etc).
- Keep responses short and suitable for voice (max 30 seconds when read).
- Extract amounts as numbers in the user's currency.
- Extract recipient names/usernames exactly as spoken.

User message format: "<transcribed speech>"

Return JSON:
{
  "intent": "intent_name",
  "entities": {
    "amount": number,
    "recipient": "name",
    "currency": "NGN|USD",
    "account_type": "wallet|card",
    "transaction_type": "transfer|bill|request"
  },
  "response": "Short voice-suitable response",
  "risk": "low|medium|high",
  "requires_confirmation": true/false,
  "confidence": 0.0-1.0,
  "clarification_needed": false,
  "follow_up_questions": ["question1", "question2"]
}`;
  }

  /**
   * Classify user intent and map to FAQ category
   */
  async classifyForFAQ(userText, faqCategories = []) {
    try {
      const intent = await this.detectIntent(userText, { featureType: 'SUPPORT' });

      // Map intent to FAQ category
      const categoryMap = {
        'ACCOUNT_BALANCE': 'Wallet & Balances',
        'TRANSACTION_HISTORY': 'Transactions',
        'SEND_MONEY': 'Sending Money',
        'REQUEST_MONEY': 'Requesting Money',
        'BILL_PAYMENT': 'Payments & Bills',
        'CARD_MANAGEMENT': 'Cards',
        'KYC_INFO': 'Verification',
        'SECURITY': 'Security & Safety',
        'HELP': 'Help & FAQ'
      };

      const mappedCategory = categoryMap[intent.intent] || 'Help & FAQ';

      return {
        intent: intent.intent,
        confidence: intent.confidence,
        faqCategory: mappedCategory,
        keywords: this.extractKeywords(userText),
        clarificationNeeded: intent.clarificationNeeded
      };
    } catch (error) {
      logger.error('FAQ classification error', error);
      throw error;
    }
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text) {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'am', 'are', 'was', 'were',
      'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'can', 'to', 'of', 'in', 'on', 'at',
      'for', 'by', 'from', 'as', 'if', 'what', 'how', 'why', 'when', 'where',
      'which', 'who', 'my', 'your', 'his', 'her', 'this', 'that'
    ]);

    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3 && !stopWords.has(word));

    return [...new Set(words)].slice(0, 5);
  }

  /**
   * Check if intent requires specific permissions
   */
  requiresPermission(intent) {
    const permissionRequired = {
      'SEND_MONEY': 'SEND_FUNDS',
      'BILL_PAYMENT': 'PAY_BILLS',
      'CARD_MANAGEMENT': 'MANAGE_CARDS',
      'KYC_INFO': 'VIEW_KYC',
      'PROFILE_UPDATE': 'UPDATE_PROFILE'
    };

    return permissionRequired[intent] || null;
  }

  /**
   * Get follow-up questions for clarification
   */
  getFollowUpQuestions(intent, userProfile = {}) {
    const questions = {
      'SEND_MONEY': [
        'Who do you want to send money to?',
        'How much do you want to send?',
        'Which wallet should this come from?'
      ],
      'REQUEST_MONEY': [
        'Who are you requesting from?',
        'How much do you need?'
      ],
      'BILL_PAYMENT': [
        'What bill are you paying? (Airtime, Electricity, Internet)',
        'Which network provider or utility?',
        'How much do you want to pay?'
      ],
      'TRANSACTION_HISTORY': [
        'Do you want to see all transactions or filter by date?',
        'What type of transactions? (Sent, Received, Bills)'
      ]
    };

    return questions[intent] || [];
  }

  /**
   * Validate intent against user permissions
   */
  async validateIntentPermissions(intent, userId, userPermissions = {}) {
    const requiredPermission = this.requiresPermission(intent);

    if (!requiredPermission) {
      return {
        allowed: true,
        reason: 'No special permission required'
      };
    }

    const hasPermission = userPermissions[requiredPermission] || false;

    return {
      allowed: hasPermission,
      reason: hasPermission ? 'Permission granted' : `Requires ${requiredPermission} permission`,
      requiredPermission
    };
  }

  /**
   * Get intent confidence interpretation
   */
  getConfidenceLevel(confidence) {
    if (confidence >= 0.9) return 'VERY_HIGH';
    if (confidence >= 0.75) return 'HIGH';
    if (confidence >= 0.6) return 'MEDIUM';
    if (confidence >= 0.4) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * Extract financial entities from intent result
   */
  extractFinancialEntities(intent, userText) {
    try {
      const entities = {
        amount: null,
        recipient: null,
        currency: 'NGN',
        account_type: 'wallet',
        transaction_type: null
      };

      // Extract amount (looks for patterns like "5000", "5k", "$100", etc.)
      const amountPatterns = [
        /(?:^|\s)(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:naira|₦|ngn)?/i,
        /(?:^|\s)([₦$€£])(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
        /(\d+)\s*(?:thousand|k|k naira|naira)/i
      ];

      for (const pattern of amountPatterns) {
        const match = userText.match(pattern);
        if (match) {
          let amount = match[1] || match[2];
          amount = parseInt(amount.replace(/[^\d]/g, ''));
          if (match[0].toLowerCase().includes('thousand') || match[0].toLowerCase().includes('k')) {
            amount *= 1000;
          }
          entities.amount = amount;
          break;
        }
      }

      // Extract recipient (person name after "to")
      const recipientPattern = /(?:to|send.*to|pay|paying)\s+(?:the\s+)?(?:person\s+)?(?:named\s+)?([\w\s]+?)(?:\s+(?:the\s+)?amount|\s+(?:₦|\$|naira|\d)|\.|,|$)/i;
      const recipientMatch = userText.match(recipientPattern);
      if (recipientMatch) {
        entities.recipient = recipientMatch[1].trim();
      }

      // Detect currency
      if (userText.toLowerCase().includes('dollar') || userText.includes('$')) {
        entities.currency = 'USD';
      }

      // Detect transaction type
      if (intent.intent === 'send_money' || intent.intent === 'request_money') {
        entities.transaction_type = 'transfer';
      } else if (intent.intent === 'bill_payment') {
        entities.transaction_type = 'bill';
      }

      return entities;
    } catch (error) {
      logger.error('Error extracting financial entities:', error);
      return {
        amount: null,
        recipient: null,
        currency: 'NGN',
        account_type: 'wallet',
        transaction_type: null
      };
    }
  }

  /**
   * Classify risk level based on intent and entities
   */
  classifyRiskLevel(intent, entities) {
    const riskMap = {
      // Low risk - information only
      'check_balance': 'low',
      'recent_transactions': 'low',
      'transfer_status': 'low',
      'faq': 'low',
      'speak_to_agent': 'low',

      // Medium risk - sensitive information
      'reset_pin': 'medium',
      'request_money': 'medium',

      // High risk - financial transactions
      'send_money': 'high',
      'bill_payment': 'high'
    };

    let baseRisk = riskMap[intent] || 'low';

    // Escalate to high if large amount detected
    if (entities.amount && entities.amount > 1000000) { // > 10,000 naira (in cents)
      if (baseRisk !== 'high') {
        baseRisk = 'medium';
      }
    }

    return baseRisk;
  }

  /**
   * Determine if confirmation is required
   */
  requiresConfirmation(intent, risk, confidence) {
    // Always require confirmation for high-risk actions
    if (risk === 'high') {
      return true;
    }

    // Require if confidence is low
    if (confidence < 0.7) {
      return true;
    }

    // Require for medium-risk actions with low-medium confidence
    if (risk === 'medium' && confidence < 0.8) {
      return true;
    }

    return false;
  }

  /**
   * Generate user-friendly response message
   */
  generateResponseMessage(intent, entities, risk) {
    const messages = {
      'check_balance': 'I will show you your current wallet balance.',
      'recent_transactions': 'Let me fetch your recent transactions.',
      'send_money': () => {
        if (entities.recipient && entities.amount) {
          return `You are about to send ${this.formatCurrency(entities.amount, entities.currency)} to ${entities.recipient}. Please confirm to continue.`;
        } else if (entities.recipient) {
          return `How much do you want to send to ${entities.recipient}?`;
        } else if (entities.amount) {
          return `Who do you want to send ${this.formatCurrency(entities.amount, entities.currency)} to?`;
        }
        return 'Who do you want to send money to, and how much?';
      },
      'request_money': () => {
        if (entities.recipient && entities.amount) {
          return `You are requesting ${this.formatCurrency(entities.amount, entities.currency)} from ${entities.recipient}.`;
        }
        return 'Who would you like to request money from?';
      },
      'bill_payment': () => {
        if (entities.amount) {
          return `You are about to pay a bill of ${this.formatCurrency(entities.amount, entities.currency)}. Please confirm.`;
        }
        return 'What bill would you like to pay?';
      },
      'reset_pin': 'I will help you reset your PIN. For security, please verify your identity first.',
      'transfer_status': 'Let me check the status of your transfer.',
      'faq': 'How can I help you today?',
      'speak_to_agent': 'I will connect you with a support agent.',
      'unknown': 'I did not understand that. Could you please repeat or say something else?'
    };

    const message = messages[intent];
    if (typeof message === 'function') {
      return message();
    } else if (typeof message === 'string') {
      return message;
    }

    return 'How can I assist you?';
  }

  /**
   * Format currency for display
   */
  formatCurrency(amountInCents, currency = 'NGN') {
    const amount = amountInCents / 100;
    const symbols = {
      'NGN': '₦',
      'USD': '$',
      'EUR': '€',
      'GBP': '£'
    };

    const symbol = symbols[currency] || currency;

    if (currency === 'NGN') {
      return `${symbol}${amount.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
    } else {
      return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  /**
   * Validate transaction entities before execution
   */
  validateTransactionEntities(entities) {
    const errors = [];

    if (!entities.amount || entities.amount <= 0) {
      errors.push('Invalid amount');
    }

    if (!entities.recipient) {
      errors.push('Recipient is required');
    }

    if (entities.amount && entities.amount > 50000000) { // 500,000 naira limit
      errors.push('Amount exceeds maximum transaction limit');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = IntentDetectionService;
