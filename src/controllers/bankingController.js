/**
 * Banking Controller
 * Handles all hands-free banking endpoints
 * Process voice commands, transactions, biometric verification, etc.
 */

const {
  BankingCommandService,
  TransactionService,
  BiometricVerificationService,
  TransactionStateManager,
} = require('../services/banking');

const BankingSession = require('../models/BankingSession');
const logger = require('../utils/logger');

class BankingController {
  constructor() {
    this.commandService = new BankingCommandService();
    this.stateManager = new TransactionStateManager();
    // transactionService and biometricService would be injected in production
  }

  /**
   * Initialize hands-free banking session
   * POST /api/banking/session/start
   */
  async startBankingSession(req, res) {
    try {
      const { userId } = req.user;
      const { featureType = 'VOICE_BANKING' } = req.body;

      // Create banking session
      const sessionId = `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const session = new BankingSession({
        userId,
        sessionId,
        featureType,
        status: 'ACTIVE',
        voiceConsent: {
          required: true,
        },
        metadata: {
          device: req.body.device || 'unknown',
          platform: req.body.platform || 'WEB',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      });

      await session.save();
      logger.info(`Banking session started: ${sessionId} for user: ${userId}`);

      res.status(200).json({
        success: true,
        sessionId,
        featureType,
        message: 'Banking session started. Ready for voice commands.',
      });
    } catch (error) {
      logger.error('Error starting banking session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start banking session',
      });
    }
  }

  /**
   * Process voice command
   * POST /api/banking/command/process
   */
  async processVoiceCommand(req, res) {
    try {
      const { userId } = req.user;
      const { sessionId, command } = req.body;

      if (!command || command.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Voice command text is required',
        });
      }

      // Get current session
      const session = await BankingSession.findOne({ sessionId, userId });
      if (!session || session.status !== 'ACTIVE') {
        return res.status(404).json({
          success: false,
          error: 'Active banking session not found',
        });
      }

      // Get user context
      const userContext = {
        contacts: req.user.contacts || [],
        balance: req.user.wallet?.balance || 0,
      };

      // Parse command
      const parsedCommand = await this.commandService.parseCommand(
        command,
        userContext
      );

      if (!parsedCommand.success) {
        await session.addInteraction({
          type: 'VOICE_COMMAND',
          voiceCommand: command,
          transcription: {
            text: command,
            confidence: 1.0,
          },
          response: {
            text: parsedCommand.error || 'Could not understand command',
            type: 'ERROR',
          },
          success: false,
          error: parsedCommand.error,
        });

        return res.status(400).json({
          success: false,
          intent: 'UNKNOWN',
          confidence: parsedCommand.confidence,
          error: parsedCommand.error,
          message: 'Please rephrase your command',
        });
      }

      // Store parsed command in session
      await session.addParsedCommand(
        command,
        parsedCommand.intent,
        parsedCommand.data,
        parsedCommand.confidence,
        parsedCommand.validation
      );

      // Generate confirmation message
      const confirmationMessage = this.commandService.generateConfirmationMessage(
        parsedCommand
      );

      // Create transaction state
      const transactionId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.stateManager.createTransactionState(transactionId, parsedCommand.data);

      // Add transaction to session
      await session.addTransaction(
        transactionId,
        parsedCommand.intent,
        parsedCommand.data.amount || 0,
        'INITIATED'
      );

      res.status(200).json({
        success: true,
        transactionId,
        intent: parsedCommand.intent,
        confidence: parsedCommand.confidence,
        confirmationMessage,
        data: parsedCommand.data,
        needsBiometricVerification: true,
      });
    } catch (error) {
      logger.error('Error processing voice command:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process command',
      });
    }
  }

  /**
   * Initiate biometric verification for transaction
   * POST /api/banking/verify/biometric/initiate
   */
  async initiateBiometricVerification(req, res) {
    try {
      const { userId } = req.user;
      const { transactionId, sessionId, preferredMethod } = req.body;

      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: 'Transaction ID is required',
        });
      }

      // Get banking session
      const session = await BankingSession.findOne({ sessionId, userId });
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      // Initialize biometric verification (in production, use actual service)
      const biometricService = new BiometricVerificationService();
      const verificationResult = await biometricService.initiateBiometricVerification(
        userId,
        transactionId,
        preferredMethod
      );

      if (!verificationResult.success) {
        return res.status(400).json({
          success: false,
          error: verificationResult.error,
        });
      }

      // Update transaction state
      await this.stateManager.transitionState(
        transactionId,
        'PENDING_BIOMETRIC',
        'Biometric verification initiated',
        { sessionId: verificationResult.sessionId }
      );

      res.status(200).json({
        success: true,
        verificationSessionId: verificationResult.sessionId,
        method: verificationResult.method,
        enrolledMethods: verificationResult.enrolledMethods,
        expiresAt: verificationResult.expiresAt,
        instructions: verificationResult.instructions,
      });
    } catch (error) {
      logger.error('Error initiating biometric verification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate biometric verification',
      });
    }
  }

  /**
   * Verify biometric input
   * POST /api/banking/verify/biometric/confirm
   */
  async verifyBiometric(req, res) {
    try {
      const { userId } = req.user;
      const { verificationSessionId, biometricData, transactionId } = req.body;

      if (!verificationSessionId || !biometricData) {
        return res.status(400).json({
          success: false,
          error: 'Verification session ID and biometric data are required',
        });
      }

      // Verify biometric (in production, use actual service)
      const biometricService = new BiometricVerificationService();
      const verificationResult = await biometricService.verifyBiometric(
        verificationSessionId,
        biometricData
      );

      if (!verificationResult.success) {
        if (verificationResult.locked) {
          return res.status(429).json({
            success: false,
            error: verificationResult.error,
            locked: true,
          });
        }

        return res.status(401).json({
          success: false,
          error: verificationResult.error,
          attemptsRemaining: verificationResult.attemptsRemaining,
        });
      }

      // Update transaction state to CONFIRMED
      if (transactionId) {
        await this.stateManager.transitionState(
          transactionId,
          'CONFIRMED',
          'Biometric verification successful',
          { method: verificationResult.method }
        );
      }

      res.status(200).json({
        success: true,
        message: 'Biometric verification successful',
        verified: true,
      });
    } catch (error) {
      logger.error('Error verifying biometric:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify biometric',
      });
    }
  }

  /**
   * Execute transaction
   * POST /api/banking/transaction/execute
   */
  async executeTransaction(req, res) {
    try {
      const { userId } = req.user;
      const { transactionId, sessionId } = req.body;

      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: 'Transaction ID is required',
        });
      }

      // Get transaction state
      const txState = this.stateManager.getState(transactionId);
      if (!txState) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found',
        });
      }

      if (txState.currentState !== 'CONFIRMED') {
        return res.status(400).json({
          success: false,
          error: `Transaction cannot be executed from state: ${txState.currentState}`,
        });
      }

      // Update state to PROCESSING
      await this.stateManager.transitionState(
        transactionId,
        'PROCESSING',
        'Transaction execution started',
        { processor: 'voice-banking-system' }
      );

      // Execute transaction (in production, use actual TransactionService)
      const transactionData = txState.metadata;

      // Simulate transaction execution
      const result = {
        success: true,
        transactionId,
        type: transactionData.intent,
        amount: transactionData.amount,
        status: 'COMPLETED',
        reference: `REF-${Date.now()}`,
        timestamp: new Date(),
      };

      // Update final state
      await this.stateManager.transitionState(
        transactionId,
        'COMPLETED',
        'Transaction completed successfully',
        {
          reference: result.reference,
          finalAmount: result.amount,
        }
      );

      // Update session
      if (sessionId) {
        const session = await BankingSession.findOne({ sessionId, userId });
        if (session) {
          await session.addTransaction(
            transactionId,
            transactionData.intent,
            transactionData.amount,
            'COMPLETED'
          );
        }
      }

      res.status(200).json({
        success: true,
        message: `${transactionData.intent} executed successfully`,
        result,
      });
    } catch (error) {
      logger.error('Error executing transaction:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute transaction',
      });
    }
  }

  /**
   * Cancel transaction
   * POST /api/banking/transaction/cancel
   */
  async cancelTransaction(req, res) {
    try {
      const { userId } = req.user;
      const { transactionId, reason } = req.body;

      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: 'Transaction ID is required',
        });
      }

      const txState = this.stateManager.getState(transactionId);
      if (!txState) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found',
        });
      }

      if (!this.stateManager.canCancel(transactionId)) {
        return res.status(400).json({
          success: false,
          error: 'Transaction cannot be cancelled from current state',
        });
      }

      await this.stateManager.transitionState(
        transactionId,
        'CANCELLED',
        reason || 'User cancelled transaction'
      );

      res.status(200).json({
        success: true,
        message: 'Transaction cancelled successfully',
      });
    } catch (error) {
      logger.error('Error cancelling transaction:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel transaction',
      });
    }
  }

  /**
   * Get transaction status and progress
   * GET /api/banking/transaction/:transactionId
   */
  async getTransactionStatus(req, res) {
    try {
      const { transactionId } = req.params;

      const txState = this.stateManager.getState(transactionId);
      if (!txState) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found',
        });
      }

      const progress = this.stateManager.getProgress(transactionId);
      const statusMessage = this.stateManager.getStatusMessage(transactionId);
      const timeRemaining = this.stateManager.getTimeRemaining(transactionId);

      res.status(200).json({
        success: true,
        transactionId,
        state: txState.currentState,
        status: statusMessage,
        progress,
        timeRemaining,
        createdAt: txState.createdAt,
        updatedAt: txState.updatedAt,
      });
    } catch (error) {
      logger.error('Error getting transaction status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get transaction status',
      });
    }
  }

  /**
   * End banking session
   * POST /api/banking/session/end
   */
  async endBankingSession(req, res) {
    try {
      const { userId } = req.user;
      const { sessionId, reason } = req.body;

      const session = await BankingSession.findOne({ sessionId, userId });
      if (!session) {
        return res. status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      // Close session and calculate analytics
      await session.closeSession(reason || 'User ended session');

      res.status(200).json({
        success: true,
        message: 'Banking session ended',
        analytics: session.analytics,
        totalTransactions: session.transactionsProcessed.length,
        completedAt: session.closedAt,
      });
    } catch (error) {
      logger.error('Error ending banking session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to end banking session',
      });
    }
  }

  /**
   * Get banking session details
   * GET /api/banking/session/:sessionId
   */
  async getSessionDetails(req, res) {
    try {
      const { userId } = req.user;
      const { sessionId } = req.params;

      const session = await BankingSession.findOne({ sessionId, userId });
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
        });
      }

      res.status(200).json({
        success: true,
        session,
      });
    } catch (error) {
      logger.error('Error getting session details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get session details',
      });
    }
  }

  /**
   * Get user's banking sessions
   * GET /api/banking/sessions
   */
  async getUserSessions(req, res) {
    try {
      const { userId } = req.user;
      const { status, page = 1, limit = 20 } = req.query;

      const sessions = await BankingSession.getUserSessions(userId, {
        status,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      const total = await BankingSession.countDocuments({
        userId,
        ...(status && { status }),
      });

      res.status(200).json({
        success: true,
        sessions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Error getting user sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sessions',
      });
    }
  }

  /**
   * Health check
   * GET /api/banking/health
   */
  async healthCheck(req, res) {
    res.status(200).json({
      success: true,
      status: 'Banking service healthy',
      timestamp: new Date(),
    });
  }
}

module.exports = new BankingController();
