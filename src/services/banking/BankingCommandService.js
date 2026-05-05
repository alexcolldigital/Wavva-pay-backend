/**
 * Banking Command Service
 * Parses and interprets voice commands for banking operations
 * Handles: Send money, Request money, Pay bills, Check balance, etc.
 */

class BankingCommandService {
  constructor() {
    this.commandPatterns = this.initializeCommandPatterns();
    this.transactionIntents = new Map();
    this.commandHistory = new Map();
  }

  /**
   * Initialize command parsing patterns for various banking operations
   */
  initializeCommandPatterns() {
    return {
      SEND_MONEY: {
        patterns: [
          /send\s+(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+to\s+([a-zA-Z\s]+)/i,
          /transfer\s+(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+to\s+([a-zA-Z\s]+)/i,
          /send\s+money\s+(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+to\s+([a-zA-Z\s]+)/i,
          /pay\s+([a-zA-Z\s]+)\s+(?:₦|naira)?\s*(\d+(?:,,\d{3})*(?:\.\d{2})?)/i,
        ],
        extractors: ['amount', 'recipient'],
      },
      REQUEST_MONEY: {
        patterns: [
          /request\s+(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+from\s+([a-zA-Z\s]+)/i,
          /ask\s+([a-zA-Z\s]+)\s+for\s+(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
        ],
        extractors: ['amount', 'sender'],
      },
      PAY_BILL: {
        patterns: [
          /pay\s+([a-zA-Z\s]+)\s+bill\s+(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
          /pay\s+([a-zA-Z\s]+)\s+(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
          /settle\s+([a-zA-Z\s]+)\s+(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
        ],
        extractors: ['provider', 'amount'],
      },
      CHECK_BALANCE: {
        patterns: [
          /(?:what'?s?\s+)?(?:my\s+)?balance/i,
          /how\s+much\s+(?:money\s+)?(?:do\s+)?i\s+have\s*/i,
          /check\s+(?:my\s+)?balance/i,
          /what\s+is\s+my\s+account\s+balance/i,
        ],
        extractors: [],
      },
      BUY_AIRTIME: {
        patterns: [
          /buy\s+(?:airtime|credit)\s+(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:for\s+)?([0-9+\s]+)/i,
          /get\s+airtime\s+(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s+for\s+([0-9+\s]+)/i,
        ],
        extractors: ['amount', 'phone'],
      },
      PAY_UTILITY: {
        patterns: [
          /pay\s+([a-zA-Z\s]+)\s+(?:bills?\s+)?(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
          /pay\s+(?:my\s+)?([a-zA-Z\s]+)\s+(?:₦|naira)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
        ],
        extractors: ['provider', 'amount'],
      },
    };
  }

  /**
   * Parse natural language command into banking transaction intent
   * @param {string} command - Voice command text
   * @param {object} context - User context (balance, contacts, etc.)
   * @returns {Promise<object>} Parsed command with intent and parameters
   */
  async parseCommand(command, context = {}) {
    try {
      const normalized = this.normalizeCommand(command);
      let matchedIntent = null;
      let extractedData = null;

      // Find matching pattern
      for (const [intent, config] of Object.entries(this.commandPatterns)) {
        for (const pattern of config.patterns) {
          const match = normalized.match(pattern);
          if (match) {
            matchedIntent = intent;
            extractedData = this.extractParameters(match, config.extractors);
            break;
          }
        }
        if (matchedIntent) break;
      }

      if (!matchedIntent) {
        return {
          success: false,
          intent: 'UNKNOWN',
          confidence: 0,
          error: 'Could not parse command. Please try again.',
        };
      }

      // Validate and enhance extracted data with context
      const enhancedData = await this.validateAndEnhance(
        extractedData,
        matchedIntent,
        context
      );

      return {
        success: enhancedData.isValid,
        intent: matchedIntent,
        confidence: enhancedData.confidence,
        data: enhancedData.data,
        validation: enhancedData.validation,
        error: enhancedData.error,
      };
    } catch (error) {
      console.error('Error parsing command:', error);
      return {
        success: false,
        intent: 'ERROR',
        confidence: 0,
        error: `Command parsing failed: ${error.message}`,
      };
    }
  }

  /**
   * Normalize command text for pattern matching
   */
  normalizeCommand(command) {
    return command
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/₦|naira/gi, 'naira')
      .replace(/please|kindly|pls/gi, '')
      .trim();
  }

  /**
   * Extract parameters from regex match groups
   */
  extractParameters(match, extractors) {
    const data = {};
    extractors.forEach((extractor, index) => {
      if (match[index + 1]) {
        if (extractor === 'amount') {
          data[extractor] = parseFloat(
            match[index + 1].replace(/,/g, '')
          );
        } else {
          data[extractor] = match[index + 1].trim();
        }
      }
    });
    return data;
  }

  /**
   * Validate and enhance command data using user context
   */
  async validateAndEnhance(data, intent, context) {
    const validation = {
      hasAllParameters: true,
      isValidAmount: true,
      recipientResolved: true,
      errors: [],
    };

    let confidence = 0.95;

    // Validate amount
    if (data.amount !== undefined) {
      if (data.amount <= 0) {
        validation.isValidAmount = false;
        validation.errors.push('Amount must be greater than zero');
        confidence -= 0.3;
      }
      if (data.amount < 100 || data.amount > 10000000) {
        validation.errors.push('Amount appears to be outside typical range');
        confidence -= 0.1;
      }
    }

    // Resolve recipient/sender
    if (data.recipient || data.sender) {
      const name = data.recipient || data.sender;
      const resolved = await this.resolveContact(name, context);
      if (!resolved) {
        validation.recipientResolved = false;
        validation.errors.push(`Could not find ${name} in contacts`);
        confidence -= 0.2;
      } else {
        data.recipientId = resolved.id;
        data.recipientName = resolved.name;
        data.recipientAccount = resolved.account;
      }
    }

    // Resolve provider for bills
    if (data.provider) {
      const provider = await this.resolveProvider(data.provider, context);
      if (!provider) {
        validation.errors.push(`Provider ${data.provider} not recognized`);
        confidence -= 0.15;
      } else {
        data.providerId = provider.id;
        data.providerName = provider.name;
      }
    }

    return {
      isValid: validation.errors.length === 0,
      confidence: Math.max(0, confidence),
      data,
      validation,
      error: validation.errors.join('; '),
    };
  }

  /**
   * Resolve contact name to contact object
   */
  async resolveContact(name, context) {
    if (!context.contacts || context.contacts.length === 0) {
      return null;
    }

    // Exact match
    let contact = context.contacts.find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    if (contact) return contact;

    // Partial match
    contact = context.contacts.find((c) =>
      c.name.toLowerCase().includes(name.toLowerCase())
    );
    if (contact) return contact;

    // Fuzzy match (simplified)
    const tokens = name.toLowerCase().split(/\s+/);
    contact = context.contacts.find((c) =>
      tokens.some((token) => c.name.toLowerCase().includes(token))
    );

    return contact;
  }

  /**
   * Resolve provider name to provider object
   */
  async resolveProvider(providerName, context) {
    const providers = {
      airtel: { id: 'airtel', name: 'Airtel', type: 'telecom' },
      mtn: { id: 'mtn', name: 'MTN', type: 'telecom' },
      glo: { id: 'glo', name: 'Glo', type: 'telecom' },
      '9mobile': { id: '9mobile', name: '9Mobile', type: 'telecom' },
      'eko disco': { id: 'eko', name: 'Eko DISCO', type: 'utility' },
      ibadanelectricity: {
        id: 'ibedc',
        name: 'IBEDC',
        type: 'utility',
      },
      kano: { id: 'kedc', name: 'KEDC', type: 'utility' },
      abuja: { id: 'aedc', name: 'AEDC', type: 'utility' },
    };

    const normalized = providerName.toLowerCase().replace(/\s+/g, '');
    return Object.values(providers).find(
      (p) =>
        p.id === normalized ||
        p.name.toLowerCase().replace(/\s+/g, '') === normalized
    );
  }

  /**
   * Generate confirmation message for parsed command
   */
  generateConfirmationMessage(parsedCommand) {
    const { intent, data } = parsedCommand;

    switch (intent) {
      case 'SEND_MONEY':
        return `Send ₦${data.amount?.toLocaleString()} to ${data.recipientName}?`;
      case 'REQUEST_MONEY':
        return `Request ₦${data.amount?.toLocaleString()} from ${data.sender}?`;
      case 'PAY_BILL':
        return `Pay ₦${data.amount?.toLocaleString()} to ${data.providerName}?`;
      case 'BUY_AIRTIME':
        return `Buy ₦${data.amount?.toLocaleString()} airtime for ${data.phone}?`;
      case 'PAY_UTILITY':
        return `Pay ₦${data.amount?.toLocaleString()} to ${data.providerName}?`;
      case 'CHECK_BALANCE':
        return 'Fetch your account balance?';
      default:
        return 'Complete this action?';
    }
  }

  /**
   * Store command for transaction context
   */
  storeCommandContext(sessionId, parsedCommand) {
    this.transactionIntents.set(sessionId, {
      command: parsedCommand,
      timestamp: new Date(),
      confirmationStatus: 'PENDING',
    });
  }

  /**
   * Retrieve stored command context
   */
  getCommandContext(sessionId) {
    return this.transactionIntents.get(sessionId);
  }

  /**
   * Clear command context after transaction
   */
  clearCommandContext(sessionId) {
    this.transactionIntents.delete(sessionId);
  }

  /**
   * Get similar past commands for learning
   */
  getSimilarCommands(command, limit = 5) {
    const normalized = this.normalizeCommand(command);
    const similar = Array.from(this.commandHistory.values())
      .filter((hist) => this.calculateSimilarity(normalized, hist.command) > 0.6)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return similar;
  }

  /**
   * Calculate similarity between two commands (simple approach)
   */
  calculateSimilarity(cmd1, cmd2) {
    const words1 = new Set(cmd1.split(/\s+/));
    const words2 = new Set(cmd2.split(/\s+/));
    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

module.exports = BankingCommandService;
