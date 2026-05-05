import { Router, Request, Response } from 'express';
import { validateInput } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import logger from '../utils/logger';
import { OpenAI } from 'openai';

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface IntentRequest {
  userInput: string;
  userId: string;
  context?: Record<string, any>;
}

interface IntentResponse {
  intent: string;
  entities: Record<string, any>;
  response: string;
  risk: string;
  requires_confirmation: boolean;
  action_required?: {
    type: string;
    details: Record<string, any>;
  };
}

/**
 * Process user voice input and detect intent
 * POST /api/ai/intent
 */
router.post(
  '/intent',
  authenticate,
  validateInput({
    userInput: 'string',
  }),
  async (req: Request, res: Response) => {
    try {
      const { userInput, context } = req.body;
      const userId = (req as any).user.id;

      logger.info(`Processing intent for user ${userId}: "${userInput}"`);

      // System prompt for consistent intent detection
      const systemPrompt = `You are a secure fintech voice assistant for WavvaPay banking app.

Your responsibilities:
1. Understand the user's request
2. Identify the intent
3. Extract relevant entities (amount, recipient, account, etc)
4. Generate a short, friendly response (max 30 words)
5. Classify risk level
6. Flag if confirmation is needed

Supported intents:
- check_balance: User wants to know their wallet balance
- recent_transactions: User wants to see transaction history
- send_money: User wants to transfer funds to someone
- pay_bill: User wants to pay a bill (airtime, electricity, etc)
- transfer_status: User wants to check status of a transfer
- reset_pin: User wants to reset their Transaction PIN
- request_loan: User wants to request a loan
- upgrade_kyc: User wants to upgrade KYC tier
- faq: User asking about features/help
- speak_to_agent: User wants to talk to support
- unknown: Intent not recognized

Risk levels:
- low: Information queries (balance, FAQ, help)
- medium: Sensitive info (transaction history, KYC details)
- high: Financial transactions (transfers, bill payments, loans)

Response format (ONLY JSON, no markdown):
{
  "intent": "detected_intent",
  "entities": {
    "amount": null,
    "recipient": null,
    "account_type": null,
    "other_relevant_fields": null
  },
  "response": "Your voice-friendly response (short, helpful, max 30 words)",
  "risk": "low|medium|high",
  "requires_confirmation": true/false,
  "action_required": {
    "type": "transaction|verification|update",
    "details": {}
  }
}

Rules:
1. Be conversational but professional
2. If details are missing, ask for clarification
3. Never suggest executing transactions - only inform about them
4. Always confirm high-risk actions
5. Validate amounts (must be > 0 and reasonable for the action)`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Process this user request: "${userInput}"${
              context ? `\n\nUser context: ${JSON.stringify(context)}` : ''
            }`,
          },
        ],
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0].message.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      const intentData: IntentResponse = JSON.parse(responseText);

      // Validate intent response
      if (!intentData.intent || !intentData.response) {
        throw new Error('Invalid intent response format');
      }

      logger.info(`Intent detected for user ${userId}: ${intentData.intent}`, {
        intent: intentData.intent,
        risk: intentData.risk,
        entities: intentData.entities,
      });

      // Log high-risk intents
      if (intentData.risk === 'high') {
        logger.warn(`High-risk intent detected for user ${userId}: ${intentData.intent}`, {
          entities: intentData.entities,
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        data: intentData,
      });
    } catch (error) {
      logger.error('Error processing intent:', error);

      if (error instanceof SyntaxError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON response from AI',
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to process intent',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Extract entities from user input
 * POST /api/ai/extract-entities
 */
router.post(
  '/extract-entities',
  authenticate,
  validateInput({
    userInput: 'string',
  }),
  async (req: Request, res: Response) => {
    try {
      const { userInput } = req.body;
      const userId = (req as any).user.id;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: `Extract financial entities from user input. Look for: amount, recipient_name, account_number, bank_name, transaction_type, etc. Return ONLY valid JSON.`,
          },
          {
            role: 'user',
            content: userInput,
          },
        ],
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0].message.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      const entities = JSON.parse(responseText);

      res.json({
        success: true,
        data: entities,
      });
    } catch (error) {
      logger.error('Error extracting entities:', error);

      res.status(500).json({
        success: false,
        message: 'Failed to extract entities',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Assess risk for a transaction
 * POST /api/ai/assess-risk
 */
router.post(
  '/assess-risk',
  authenticate,
  validateInput({
    transactionDetails: 'object',
  }),
  async (req: Request, res: Response) => {
    try {
      const { transactionDetails } = req.body;
      const userId = (req as any).user.id;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a fintech risk assessment AI. Analyze transaction details and return a JSON with:
- risk_level: "low"|"medium"|"high"
- risk_score: 0-100
- flags: array of risk factors
- recommendation: "proceed"|"verify"|"block"

Only return valid JSON.`,
          },
          {
            role: 'user',
            content: `Assess risk for this transaction:\n${JSON.stringify(transactionDetails, null, 2)}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0].message.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      const riskAssessment = JSON.parse(responseText);

      // Log high-risk assessments
      if (riskAssessment.risk_level === 'high') {
        logger.warn(`High-risk transaction detected for user ${userId}`, {
          assessment: riskAssessment,
          transactionDetails,
        });
      }

      res.json({
        success: true,
        data: riskAssessment,
      });
    } catch (error) {
      logger.error('Error assessing risk:', error);

      res.status(500).json({
        success: false,
        message: 'Failed to assess risk',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Get contextual help based on query
 * GET /api/ai/help?query=...
 */
router.get(
  '/help',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { query } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Query parameter is required',
        });
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful fintech assistant for WavvaPay. Provide concise, voice-friendly help. Max 50 words.',
          },
          {
            role: 'user',
            content: `Help me with: ${query}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 150,
      });

      const helpResponse = completion.choices[0].message.content || '';

      res.json({
        success: true,
        data: {
          help: helpResponse,
        },
      });
    } catch (error) {
      logger.error('Error getting help:', error);

      res.status(500).json({
        success: false,
        message: 'Failed to get help',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Validate transaction with AI before execution
 * POST /api/ai/validate-transaction
 */
router.post(
  '/validate-transaction',
  authenticate,
  validateInput({
    transactionDetails: 'object',
  }),
  async (req: Request, res: Response) => {
    try {
      const { transactionDetails } = req.body;
      const userId = (req as any).user.id;

      // Validate with risk assessment
      const riskResponse = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: `Validate a user's transaction request. Return JSON with:
- is_valid: boolean
- reason: string explaining validation result
- requires_verification: boolean
- suggested_action: string

Check for:
- Valid amounts (> 0, reasonable for amount type)
- Valid recipient (not empty)
- Duplicate transactions (too frequent/same amount)`,
          },
          {
            role: 'user',
            content: `Validate this transaction:\n${JSON.stringify(transactionDetails, null, 2)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      });

      const responseText = riskResponse.choices[0].message.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      const validation = JSON.parse(responseText);

      res.json({
        success: true,
        data: validation,
      });
    } catch (error) {
      logger.error('Error validating transaction:', error);

      res.status(500).json({
        success: false,
        message: 'Failed to validate transaction',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
