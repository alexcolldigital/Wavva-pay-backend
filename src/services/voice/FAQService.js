const logger = require('../../utils/logger');

class FAQService {
  constructor() {
    this.faqs = this.initializeFAQs();
    logger.info('FAQService initialized with FAQs');
  }

  /**
   * Initialize FAQ database
   */
  initializeFAQs() {
    return [
      // Account & Balance
      {
        id: 'faq_001',
        category: 'Wallet & Balances',
        question: 'How do I check my wallet balance?',
        keywords: ['balance', 'wallet', 'check', 'how much'],
        answer: 'You can check your wallet balance by going to the Wallet section in the app. Your current balance will be displayed at the top of the screen. You can also see your balance on the dashboard.'
      },
      {
        id: 'faq_002',
        category: 'Wallet & Balances',
        question: 'What are the different wallet types?',
        keywords: ['wallet', 'types', 'account', 'kind'],
        answer: 'Wavva Pay offers multiple wallet types: Main Wallet for everyday spending, Savings Wallet for saving money with interest, and Shared Wallets for splitting expenses with friends.'
      },
      {
        id: 'faq_003',
        category: 'Wallet & Balances',
        question: 'Why is my balance showing as pending?',
        keywords: ['pending', 'balance', 'transaction', 'wait'],
        answer: 'Pending balance means your transaction is being processed. Most transactions complete within 2-24 hours. You can check the transaction details to see the expected completion time.'
      },

      // Sending Money
      {
        id: 'faq_004',
        category: 'Sending Money',
        question: 'How do I send money to another user?',
        keywords: ['send', 'transfer', 'money', 'another', 'person'],
        answer: 'To send money: 1) Go to the Transfer section 2) Enter the recipient username or phone number 3) Enter the amount 4) Add a note (optional) 5) Confirm with your PIN or biometric authentication 6) Your transfer will be sent immediately.'
      },
      {
        id: 'faq_005',
        category: 'Sending Money',
        question: 'What are the transfer limits?',
        keywords: ['limit', 'maximum', 'transfer', 'amount', 'max'],
        answer: 'Daily transfer limits are: Daily limit is 500,000 NGN. Weekly limit is 2,000,000 NGN. Monthly limit is 10,000,000 NGN. These limits may vary based on your verification level.'
      },
      {
        id: 'faq_006',
        category: 'Sending Money',
        question: 'How long does a transfer take?',
        keywords: ['time', 'how long', 'transfer', 'duration', 'receive'],
        answer: 'Most transfers are instant and credited within seconds. In rare cases, transfers may take up to 24 hours. You will receive a notification when the money reaches the recipient.'
      },

      // Requesting Money
      {
        id: 'faq_007',
        category: 'Requesting Money',
        question: 'How do I request money from someone?',
        keywords: ['request', 'ask', 'money', 'from', 'owe'],
        answer: 'To request money: 1) Go to the Requests section 2) Tap Request Money 3) Select a contact or enter their username 4) Enter the amount and reason 5) Send the request. They will receive a notification and can approve or decline your request.'
      },
      {
        id: 'faq_008',
        category: 'Requesting Money',
        question: 'Can I cancel a money request?',
        keywords: ['cancel', 'request', 'undo', 'remove', 'delete'],
        answer: 'Yes, you can cancel an outstanding money request. Go to the Requests section, find the request, and tap the cancel option. The recipient will be notified of the cancellation.'
      },

      // Transactions
      {
        id: 'faq_009',
        category: 'Transactions',
        question: 'How do I view my transaction history?',
        keywords: ['history', 'transactions', 'past', 'view', 'see'],
        answer: 'You can view your transaction history by going to the Transactions section. You can filter by transaction type (sent, received, bills) or date range. Tap on any transaction to see more details.'
      },
      {
        id: 'faq_010',
        category: 'Transactions',
        question: 'Can I dispute a transaction?',
        keywords: ['dispute', 'issue', 'problem', 'transaction', 'wrong'],
        answer: 'Yes, you can dispute a transaction. Go to the transaction details and tap Report Issue. Describe the problem and our support team will investigate within 48 hours.'
      },

      // Payments & Bills
      {
        id: 'faq_011',
        category: 'Payments & Bills',
        question: 'How do I buy airtime?',
        keywords: ['airtime', 'buy', 'mobile', 'phone', 'credit'],
        answer: 'To buy airtime: 1) Go to the Bills section 2) Select Airtime 3) Choose your network provider 4) Enter the phone number and amount 5) Confirm the payment. The airtime will be credited instantly.'
      },
      {
        id: 'faq_012',
        category: 'Payments & Bills',
        question: 'Which utilities can I pay for?',
        keywords: ['pay', 'bills', 'utility', 'electricity', 'water', 'internet'],
        answer: 'Wavva Pay supports payments for: Electricity (PHCN, others), Water bills, Internet subscriptions, Insurance premiums, and more. Check the Bills section for the latest available services.'
      },
      {
        id: 'faq_013',
        category: 'Payments & Bills',
        question: 'What if a bill payment fails?',
        keywords: ['failed', 'failure', 'Bill', 'error', 'problem'],
        answer: 'If a bill payment fails, you will be notified immediately. Your account will not be charged. Check your internet connection and try again, or contact support if the issue persists.'
      },

      // Cards
      {
        id: 'faq_014',
        category: 'Cards',
        question: 'How do I add a debit card?',
        keywords: ['card', 'add', 'debit', 'payment', 'method'],
        answer: 'To add a debit card: 1) Go to Settings 2) Select Payment Methods 3) Tap Add Card 4) Enter your card details (number, CVC, expiry) 5) Verify with OTP. Your card is now ready for payments.'
      },
      {
        id: 'faq_015',
        category: 'Cards',
        question: 'Is it safe to add my card to Wavva Pay?',
        keywords: ['safe', 'secure', 'card', 'security', 'protect'],
        answer: 'Yes, Wavva Pay uses industry-standard AES-256 encryption to protect your card information. We are certified by payment security standards and never store your full card details.'
      },

      // Verification & KYC
      {
        id: 'faq_016',
        category: 'Verification',
        question: 'What is KYC and why do I need it?',
        keywords: ['KYC', 'know', 'customer', 'verify', 'verification'],
        answer: 'KYC (Know Your Customer) is a verification process required by law. It helps us confirm your identity and protect against fraud. KYC is required to increase your transaction limits.'
      },
      {
        id: 'faq_017',
        category: 'Verification',
        question: 'How long does KYC verification take?',
        keywords: ['how long', 'KYC', 'verify', 'verification', 'time'],
        answer: 'Basic KYC verification takes 2-5 minutes and is instant. Full KYC verification can take up to 24 hours as our team reviews your documents. You will receive notification once verified.'
      },
      {
        id: 'faq_018',
        category: 'Verification',
        question: 'Why was my KYC application rejected?',
        keywords: ['rejected', 'denial', 'KYC', 'failed', 'reason'],
        answer: 'Common reasons for rejection include: Poor image quality, document not matching ID type, duplicate account, or suspicious activity. You can resubmit with corrected documents. Contact support for specific feedback.'
      },

      // Security & Safety
      {
        id: 'faq_019',
        category: 'Security & Safety',
        question: 'How do I reset my password?',
        keywords: ['password', 'reset', 'forgot', 'change'],
        answer: 'To reset your password: 1) Tap Forgot Password on login 2) Enter your email address 3) Check your email for a reset link 4) Click the link and create a new password 5) Save your new password in a secure location.'
      },
      {
        id: 'faq_020',
        category: 'Security & Safety',
        question: 'What should I do if my account is compromised?',
        keywords: ['compromised', 'hacked', 'security', 'breach', 'unauthorized'],
        answer: 'If you suspect your account is compromised: 1) Change your password immediately 2) Enable two-factor authentication 3) Contact support urgently 4) Review recent transactions 5) We can freeze your account if needed. Act quickly to protect your funds.'
      },
      {
        id: 'faq_021',
        category: 'Security & Safety',
        question: 'Is my biometric data safe?',
        keywords: ['biometric', 'fingerprint', 'face', 'safe', 'secure'],
        answer: 'Yes, your biometric data is encrypted and stored only on your device, never on our servers. Your fingerprint or face ID is only used to unlock the app. We comply with data protection laws.'
      },

      // Friends & Splitting
      {
        id: 'faq_022',
        category: 'Friends & Groups',
        question: 'How do I add a friend in Wavva Pay?',
        keywords: ['friend', 'add', 'contact', 'connection'],
        answer: 'To add a friend: 1) Go to Friends section 2) Tap Add Friend 3) Search by username or phone number 4) Tap Add. Once they accept, you can easily send or request money from them.'
      },
      {
        id: 'faq_023',
        category: 'Friends & Groups',
        question: 'How do I split expenses with friends?',
        keywords: ['split', 'expense', 'divide', 'friends', 'share'],
        answer: 'To split an expense: 1) Go to Combines section 2) Tap Create Combine 3) Add the expense name and amount 4) Select friends to split with 5) Confirm the split. Each person will see their share and can pay when ready.'
      },

      // General Help
      {
        id: 'faq_024',
        category: 'Help & FAQ',
        question: 'How do I contact customer support?',
        keywords: ['support', 'contact', 'help', 'customer', 'service'],
        answer: 'You can reach our support in multiple ways: 1) Use the in-app help chat 2) Email support@wavvapay.com 3) Call our hotline 4) Message us on social media. Our team responds within 2 hours.'
      },
      {
        id: 'faq_025',
        category: 'Help & FAQ',
        question: 'What should I do if the app is not working?',
        keywords: ['app', 'working', 'not', 'issue', 'problem', 'bug'],
        answer: 'If the app is not working: 1) Try restarting the app 2) Check your internet connection 3) Update the app to the latest version 4) Clear the app cache 5) Reinstall the app if needed. Contact support if the issue persists.'
      }
    ];
  }

  /**
   * Search FAQs by query
   */
  searchFAQs(query, category = null) {
    if (!query || query.trim().length === 0) {
      return category ? this.getFAQsByCategory(category) : this.faqs;
    }

    const queryLower = query.toLowerCase();
    let results = this.faqs.filter(faq => {
      const matchesQuery = 
        faq.question.toLowerCase().includes(queryLower) ||
        faq.answer.toLowerCase().includes(queryLower) ||
        faq.keywords.some(kw => kw.includes(queryLower));

      const matchesCategory = !category || faq.category === category;

      return matchesQuery && matchesCategory;
    });

    // Score results by relevance
    results = results.map(faq => ({
      ...faq,
      relevanceScore: this.calculateRelevanceScore(faq, queryLower)
    })).sort((a, b) => b.relevanceScore - a.relevanceScore);

    return results;
  }

  /**
   * Calculate relevance score for search results
   */
  calculateRelevanceScore(faq, query) {
    let score = 0;

    // Exact match in question
    if (faq.question.toLowerCase() === query) {
      score += 100;
    }

    // Contains query in question
    if (faq.question.toLowerCase().includes(query)) {
      score += 50;
    }

    // Match in keywords
    if (faq.keywords.some(kw => kw.toLowerCase() === query)) {
      score += 30;
    }

    // Partial match in answer
    if (faq.answer.toLowerCase().includes(query)) {
      score += 10;
    }

    return score;
  }

  /**
   * Get FAQs by category
   */
  getFAQsByCategory(category) {
    return this.faqs.filter(faq => faq.category === category);
  }

  /**
   * Get all categories
   */
  getCategories() {
    const categories = new Set(this.faqs.map(faq => faq.category));
    return Array.from(categories).sort();
  }

  /**
   * Get FAQ by ID
   */
  getFAQById(id) {
    return this.faqs.find(faq => faq.id === id);
  }

  /**
   * Get related FAQs
   */
  getRelatedFAQs(faqId, limit = 3) {
    const faq = this.getFAQById(faqId);
    if (!faq) return [];

    const related = this.faqs
      .filter(f => f.id !== faqId && f.category === faq.category)
      .slice(0, limit);

    return related;
  }

  /**
   * Get FAQs by intent
   */
  getFAQsByIntent(intent, limit = 5) {
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

    const category = categoryMap[intent];
    if (!category) {
      return this.faqs.slice(0, limit);
    }

    return this.getFAQsByCategory(category).slice(0, limit);
  }

  /**
   * Format FAQ for voice response
   */
  formatForVoice(faq) {
    return {
      id: faq.id,
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
      summary: this.createSummary(faq.answer) // Shorter version for voice
    };
  }

  /**
   * Create summary of answer for voice
   */
  createSummary(answer, maxLength = 250) {
    if (answer.length <= maxLength) {
      return answer;
    }

    const sentences = answer.match(/[^.!?]+[.!?]+/g) || [answer];
    let summary = '';

    for (const sentence of sentences) {
      if ((summary + sentence).length <= maxLength) {
        summary += sentence;
      } else {
        break;
      }
    }

    return summary.trim() || answer.slice(0, maxLength);
  }

  /**
   * Add custom FAQ (admin function)
   */
  addFAQ(question, answer, category, keywords = []) {
    const id = `faq_${Date.now()}`;
    const faq = {
      id,
      category,
      question,
      answer,
      keywords: [...keywords, ...this.extractKeywords(question)]
    };

    this.faqs.push(faq);
    logger.info('FAQ added', { id, category });

    return faq;
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'my', 'how', 'what', 'why']);
    return text
      .split(/\W+/)
      .filter(word => word.length > 2 && !stopWords.has(word.toLowerCase()))
      .map(word => word.toLowerCase())
      .slice(0, 5);
  }
}

module.exports = FAQService;
