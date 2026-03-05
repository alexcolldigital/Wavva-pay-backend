/**
 * Transaction Service
 * Handles transaction validation, execution, and state management
 * Supports: Transfers, bill payments, airtime purchases, etc.
 */

const axios = require('axios');

class TransactionService {
  constructor(walletService, notificationService) {
    this.walletService = walletService;
    this.notificationService = notificationService;
    this.transactionQueue = [];
    this.failedTransactions = new Map();
    this.retryAttempts = 3;
  }

  /**
   * Validate transaction before execution
   * @param {object} transaction - Transaction object with intent, amount, recipient, etc.
   * @param {object} user - User object with wallet info
   * @returns {Promise<object>} Validation result
   */
  async validateTransaction(transaction, user) {
    const errors = [];
    const warnings = [];

    try {
      // Check user has authenticated
      if (!user || !user.id) {
        errors.push('User not authenticated');
      }

      // Check wallet exists and is active
      if (!user.wallet || user.wallet.status !== 'ACTIVE') {
        errors.push('Wallet is not active');
      }

      // Validate amount
      if (!transaction.amount || transaction.amount <= 0) {
        errors.push('Invalid transaction amount');
      }

      // Check sufficient balance
      const walletBalance = await this.walletService.getBalance(user.id);
      if (walletBalance < transaction.amount) {
        errors.push(
          `Insufficient balance. Available: ₦${walletBalance.toLocaleString()}`
        );
      }

      // Check daily transaction limit
      const dailyTotal = await this.getDailyTransactionTotal(user.id);
      const dailyLimit = user.transactionLimit || 10000000;
      if (dailyTotal + transaction.amount > dailyLimit) {
        errors.push(
          `Daily transaction limit exceeded. Remaining: ₦${(dailyLimit - dailyTotal).toLocaleString()}`
        );
      }

      // Check transaction amount limits
      const limits = this.getTransactionLimits(transaction.intent);
      if (transaction.amount < limits.min) {
        warnings.push(`Amount is below typical minimum of ₦${limits.min}`);
      }
      if (transaction.amount > limits.max) {
        errors.push(
          `Amount exceeds maximum limit of ₦${limits.max.toLocaleString()}`
        );
      }

      // Validate recipient for transfers
      if (transaction.intent === 'SEND_MONEY' && transaction.recipientId) {
        const recipientValid = await this.validateRecipient(
          transaction.recipientId
        );
        if (!recipientValid) {
          errors.push('Recipient account is invalid or blocked');
        }
      }

      // Check for suspicious patterns
      const suspiciousFlags = await this.checkSuspiciousActivity(
        user.id,
        transaction
      );
      if (suspiciousFlags.length > 0) {
        warnings.push(...suspiciousFlags);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        riskLevel: this.calculateRiskLevel(errors, warnings, transaction),
      };
    } catch (error) {
      console.error('Error validating transaction:', error);
      return {
        valid: false,
        errors: [`Validation failed: ${error.message}`],
        warnings: [],
        riskLevel: 'CRITICAL',
      };
    }
  }

  /**
   * Get transaction limits by type
   */
  getTransactionLimits(intent) {
    const limits = {
      SEND_MONEY: { min: 100, max: 5000000 },
      PAY_BILL: { min: 100, max: 5000000 },
      BUY_AIRTIME: { min: 50, max: 100000 },
      PAY_UTILITY: { min: 100, max: 10000000 },
      REQUEST_MONEY: { min: 100, max: 5000000 },
    };

    return limits[intent] || { min: 100, max: 5000000 };
  }

  /**
   * Calculate transaction risk level
   */
  calculateRiskLevel(errors, warnings, transaction) {
    if (errors.length > 0) return 'HIGH';
    if (warnings.length >= 2) return 'MEDIUM';
    if (transaction.amount > 1000000) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Validate recipient account
   */
  async validateRecipient(recipientId) {
    try {
      // Check if recipient exists and account is active
      const recipient = await this.walletService.getUserWallet(recipientId);
      return recipient && recipient.status === 'ACTIVE';
    } catch (error) {
      console.error('Error validating recipient:', error);
      return false;
    }
  }

  /**
   * Check for suspicious activity patterns
   */
  async checkSuspiciousActivity(userId, transaction) {
    const flags = [];

    try {
      // Get recent transactions
      const recentTx = await this.getRecentTransactions(userId, 24); // Last 24 hours
      
      // Check for rapid-fire transactions
      if (recentTx.length >= 5) {
        flags.push('Multiple recent transactions detected');
      }

      // Check for unusually large amounts
      const avgAmount =
        recentTx.reduce((sum, tx) => sum + tx.amount, 0) / recentTx.length || 0;
      if (transaction.amount > avgAmount * 5) {
        flags.push('Unusually large transaction amount');
      }

      // Check for unusual time of day
      const hour = new Date().getHours();
      if (hour < 23 || hour > 6) {
        // Flag as off-hours
      }

      // Check for blocked recipients or patterns
      if (await this.isBlockedPattern(userId, transaction)) {
        flags.push('Transaction pattern flagged');
      }
    } catch (error) {
      console.error('Error checking suspicious activity:', error);
    }

    return flags;
  }

  /**
   * Check if transaction matches blocked patterns
   */
  async isBlockedPattern(userId, transaction) {
    // TODO: Implement machine learning based pattern detection
    return false;
  }

  /**
   * Execute validated transaction
   * @param {object} transaction - Validated transaction object
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID for tracking
   * @returns {Promise<object>} Transaction result
   */
  async executeTransaction(transaction, userId, sessionId) {
    const transactionId = this.generateTransactionId();
    const startTime = Date.now();

    try {
      // Add to queue for processing
      this.transactionQueue.push({
        id: transactionId,
        transaction,
        userId,
        sessionId,
        timestamp: new Date(),
        status: 'PROCESSING',
      });

      // Execute based on transaction type
      let result;
      switch (transaction.intent) {
        case 'SEND_MONEY':
          result = await this.executeTransfer(
            transaction,
            userId,
            transactionId
          );
          break;
        case 'PAY_BILL':
          result = await this.executeBillPayment(
            transaction,
            userId,
            transactionId
          );
          break;
        case 'BUY_AIRTIME':
          result = await this.executeBuyAirtime(
            transaction,
            userId,
            transactionId
          );
          break;
        case 'PAY_UTILITY':
          result = await this.executeUtilityPayment(
            transaction,
            userId,
            transactionId
          );
          break;
        case 'REQUEST_MONEY':
          result = await this.executeMoneyRequest(
            transaction,
            userId,
            transactionId
          );
          break;
        default:
          throw new Error(`Unknown transaction type: ${transaction.intent}`);
      }

      // Update queue status
      const queueIndex = this.transactionQueue.findIndex(
        (tx) => tx.id === transactionId
      );
      if (queueIndex !== -1) {
        this.transactionQueue[queueIndex].status = result.success
          ? 'COMPLETED'
          : 'FAILED';
        this.transactionQueue[queueIndex].duration = Date.now() - startTime;
      }

      // Send notifications
      await this.notifyTransactionResult(userId, result);

      return result;
    } catch (error) {
      console.error('Error executing transaction:', error);

      // Store failed transaction for retry
      this.failedTransactions.set(transactionId, {
        transaction,
        userId,
        sessionId,
        error: error.message,
        attempts: 1,
        nextRetry: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      return {
        success: false,
        transactionId,
        error: `Transaction failed: ${error.message}`,
        status: 'FAILED',
      };
    }
  }

  /**
   * Execute money transfer
   */
  async executeTransfer(transaction, userId, transactionId) {
    // Debit user account
    await this.walletService.debitWallet(
      userId,
      transaction.amount,
      `Transfer to ${transaction.recipientName}`,
      transactionId
    );

    // Credit recipient account
    await this.walletService.creditWallet(
      transaction.recipientId,
      transaction.amount,
      `Transfer from user ${userId}`,
      transactionId
    );

    return {
      success: true,
      transactionId,
      type: 'SEND_MONEY',
      amount: transaction.amount,
      recipient: transaction.recipientName,
      timestamp: new Date(),
      status: 'COMPLETED',
      message: `Successfully sent ₦${transaction.amount.toLocaleString()} to ${transaction.recipientName}`,
    };
  }

  /**
   * Execute bill payment
   */
  async executeBillPayment(transaction, userId, transactionId) {
    const billProvider = this.getBillProvider(transaction.providerId);

    // TODO: Integrate with bill payment gateway
    // For now, simulate payment
    await this.walletService.debitWallet(
      userId,
      transaction.amount,
      `Payment to ${transaction.providerName}`,
      transactionId
    );

    return {
      success: true,
      transactionId,
      type: 'PAY_BILL',
      amount: transaction.amount,
      provider: transaction.providerName,
      timestamp: new Date(),
      status: 'COMPLETED',
      message: `Successfully paid ₦${transaction.amount.toLocaleString()} to ${transaction.providerName}`,
    };
  }

  /**
   * Execute airtime purchase
   */
  async executeBuyAirtime(transaction, userId, transactionId) {
    const provider = this.getTelecomProvider(transaction.providerId);

    // TODO: Integrate with telecom API
    // For now, simulate purchase
    await this.walletService.debitWallet(
      userId,
      transaction.amount,
      `Airtime purchase for ${transaction.phone}`,
      transactionId
    );

    return {
      success: true,
      transactionId,
      type: 'BUY_AIRTIME',
      amount: transaction.amount,
      phone: transaction.phone,
      provider: transaction.providerName,
      timestamp: new Date(),
      status: 'COMPLETED',
      message: `Successfully bought ₦${transaction.amount.toLocaleString()} airtime for ${transaction.phone}`,
    };
  }

  /**
   * Execute utility payment
   */
  async executeUtilityPayment(transaction, userId, transactionId) {
    // TODO: Integrate with utility provider APIs
    // For now, simulate payment
    await this.walletService.debitWallet(
      userId,
      transaction.amount,
      `Payment to ${transaction.providerName}`,
      transactionId
    );

    return {
      success: true,
      transactionId,
      type: 'PAY_UTILITY',
      amount: transaction.amount,
      provider: transaction.providerName,
      timestamp: new Date(),
      status: 'COMPLETED',
      message: `Successfully paid ₦${transaction.amount.toLocaleString()} to ${transaction.providerName}`,
    };
  }

  /**
   * Execute money request
   */
  async executeMoneyRequest(transaction, userId, transactionId) {
    // Create pending request that recipient can approve/decline
    // TODO: Implement money request workflow

    return {
      success: true,
      transactionId,
      type: 'REQUEST_MONEY',
      amount: transaction.amount,
      sender: transaction.sender,
      timestamp: new Date(),
      status: 'PENDING',
      message: `Money request sent to ${transaction.sender}`,
    };
  }

  /**
   * Get recent transactions for a user
   */
  async getRecentTransactions(userId, hoursBack) {
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    // TODO: Query from database
    return [];
  }

  /**
   * Get daily transaction total
   */
  async getDailyTransactionTotal(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // TODO: Query from database
    return 0;
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId() {
    return `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get bill provider details
   */
  getBillProvider(providerId) {
    const providers = {
      eko: { id: 'eko', name: 'EKO DISCO', type: 'electricity' },
      ibedc: { id: 'ibedc', name: 'IBEDC', type: 'electricity' },
      kedc: { id: 'kedc', name: 'KEDC', type: 'electricity' },
      aedc: { id: 'aedc', name: 'AEDC', type: 'electricity' },
    };
    return providers[providerId];
  }

  /**
   * Get telecom provider details
   */
  getTelecomProvider(providerId) {
    const providers = {
      airtel: { id: 'airtel', name: 'Airtel', type: 'telecom' },
      mtn: { id: 'mtn', name: 'MTN', type: 'telecom' },
      glo: { id: 'glo', name: 'Glo', type: 'telecom' },
      '9mobile': { id: '9mobile', name: '9Mobile', type: 'telecom' },
    };
    return providers[providerId];
  }

  /**
   * Notify user of transaction result
   */
  async notifyTransactionResult(userId, result) {
    try {
      if (this.notificationService) {
        await this.notificationService.sendNotification(userId, {
          type: 'TRANSACTION_RESULT',
          title: result.success ? 'Transaction Successful' : 'Transaction Failed',
          message: result.message,
          data: result,
        });
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Retry failed transactions
   */
  async retryFailedTransactions() {
    const now = Date.now();
    const transactionsToRetry = Array.from(this.failedTransactions.entries())
      .filter(([_, tx]) => tx.nextRetry <= now && tx.attempts < this.retryAttempts)
      .map(([id, tx]) => ({ id, ...tx }));

    for (const tx of transactionsToRetry) {
      try {
        const result = await this.executeTransaction(
          tx.transaction,
          tx.userId,
          tx.sessionId
        );
        if (result.success) {
          this.failedTransactions.delete(tx.id);
        } else {
          tx.attempts++;
          tx.nextRetry = now + 5 * 60 * 1000; // 5 minutes
        }
      } catch (error) {
        console.error(`Error retrying transaction ${tx.id}:`, error);
      }
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionId) {
    const queuedTx = this.transactionQueue.find((tx) => tx.id === transactionId);
    if (queuedTx) {
      return queuedTx;
    }

    const failedTx = this.failedTransactions.get(transactionId);
    if (failedTx) {
      return {
        id: transactionId,
        status: 'FAILED',
        ...failedTx,
      };
    }

    // TODO: Query database for historical transactions
    return null;
  }
}

module.exports = TransactionService;
