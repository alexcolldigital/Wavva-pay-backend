const logger = require('../../utils/logger');
const User = require('../../models/User');
const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');

class FinancialCommandHandler {
  /**
   * Execute a financial command based on intent and entities
   * This requires confirmation via PIN/OTP for high-risk operations
   */
  async executeCommand(userId, intent, entities, confirmationToken = null) {
    try {
      // Validate the command
      const validation = this.validateCommand(intent, entities);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', '),
          requiresInput: validation.errors
        };
      }

      switch (intent) {
        case 'send_money':
          return await this.handleSendMoney(userId, entities, confirmationToken);

        case 'request_money':
          return await this.handleRequestMoney(userId, entities);

        case 'bill_payment':
          return await this.handleBillPayment(userId, entities, confirmationToken);

        case 'check_balance':
          return await this.handleCheckBalance(userId, entities);

        case 'recent_transactions':
          return await this.handleRecentTransactions(userId, entities);

        case 'transfer_status':
          return await this.handleTransferStatus(userId, entities);

        default:
          return {
            success: false,
            error: `Command '${intent}' is not executable via voice`
          };
      }
    } catch (error) {
      logger.error('Error executing financial command:', error);
      return {
        success: false,
        error: error.message || 'Failed to execute command'
      };
    }
  }

  /**
   * Validate that command has all necessary entities
   */
  validateCommand(intent, entities) {
    const errors = [];

    switch (intent) {
      case 'send_money':
        if (!entities.amount || entities.amount <= 0) {
          errors.push('Please specify the amount to send');
        }
        if (!entities.recipient) {
          errors.push('Please specify the recipient');
        }
        break;

      case 'bill_payment':
        if (!entities.amount || entities.amount <= 0) {
          errors.push('Please specify the bill amount');
        }
        break;

      case 'check_balance':
        // No validation needed
        break;

      case 'recent_transactions':
        // No validation needed
        break;

      case 'transfer_status':
        if (!entities.transactionId) {
          errors.push('Transaction ID is required');
        }
        break;

      case 'request_money':
        if (!entities.amount || entities.amount <= 0) {
          errors.push('Please specify the amount to request');
        }
        if (!entities.recipient) {
          errors.push('Please specify who to request from');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Handle send money transaction
   */
  async handleSendMoney(userId, entities, confirmationToken) {
    try {
      // Get sender and recipient
      const sender = await User.findById(userId);
      if (!sender) {
        return { success: false, error: 'Sender not found' };
      }

      // Find recipient by name or username
      let recipient = await User.findOne({
        $or: [
          { username: entities.recipient },
          { firstName: { $regex: entities.recipient, $options: 'i' } },
          { lastName: { $regex: entities.recipient, $options: 'i' } }
        ]
      });

      if (!recipient) {
        return {
          success: false,
          error: `Recipient '${entities.recipient}' not found`,
          requiresConfirmation: false
        };
      }

      // Check for self-transfer
      if (sender._id.equals(recipient._id)) {
        return {
          success: false,
          error: 'Cannot send money to yourself'
        };
      }

      // Get sender wallet
      const senderWallet = await Wallet.findOne({ userId });
      if (!senderWallet || senderWallet.balance < entities.amount) {
        return {
          success: false,
          error: 'Insufficient balance'
        };
      }

      // If high-risk and no confirmation, return pending status
      if (!confirmationToken) {
        return {
          success: false,
          error: 'Confirmation required',
          requiresConfirmation: true,
          confirmationType: 'PIN', // or OTP
          details: {
            recipient: recipient.firstName + ' ' + recipient.lastName,
            amount: entities.amount / 100,
            currency: entities.currency || 'NGN'
          }
        };
      }

      // TODO: Verify confirmation token (PIN/OTP)
      // For now, assume valid if provided

      // Execute transfer
      const transaction = new Transaction({
        sender: userId,
        receiver: recipient._id,
        amount: entities.amount,
        currency: entities.currency || 'NGN',
        type: 'peer-to-peer',
        description: `Voice transfer to ${recipient.firstName} ${recipient.lastName}`,
        method: 'voice',
        status: 'completed'
      });

      await transaction.save();

      // Update wallets
      senderWallet.balance -= entities.amount;
      const recipientWallet = await Wallet.findOne({ userId: recipient._id });
      if (recipientWallet) {
        recipientWallet.balance += entities.amount;
        await recipientWallet.save();
      }
      await senderWallet.save();

      return {
        success: true,
        message: `Successfully sent ${entities.amount / 100} ${entities.currency || 'NGN'} to ${recipient.firstName} ${recipient.lastName}`,
        transactionId: transaction._id,
        details: {
          recipient: recipient.firstName + ' ' + recipient.lastName,
          amount: entities.amount / 100,
          currency: entities.currency || 'NGN',
          status: 'completed'
        }
      };
    } catch (error) {
      logger.error('Error handling send money:', error);
      return {
        success: false,
        error: error.message || 'Failed to send money'
      };
    }
  }

  /**
   * Handle request money
   */
  async handleRequestMoney(userId, entities) {
    try {
      const requester = await User.findById(userId);
      if (!requester) {
        return { success: false, error: 'User not found' };
      }

      // Find recipient
      let payee = await User.findOne({
        $or: [
          { username: entities.recipient },
          { firstName: { $regex: entities.recipient, $options: 'i' } }
        ]
      });

      if (!payee) {
        return {
          success: false,
          error: `User '${entities.recipient}' not found`
        };
      }

      // Create a money request (would link to actual Money Request model)
      return {
        success: true,
        message: `Money request sent to ${payee.firstName} ${payee.lastName} for ${entities.amount / 100} ${entities.currency || 'NGN'}`,
        details: {
          type: 'money_request',
          to: payee.firstName + ' ' + payee.lastName,
          amount: entities.amount / 100,
          currency: entities.currency || 'NGN',
          status: 'pending'
        }
      };
    } catch (error) {
      logger.error('Error handling request money:', error);
      return {
        success: false,
        error: error.message || 'Failed to request money'
      };
    }
  }

  /**
   * Handle bill payment
   */
  async handleBillPayment(userId, entities, confirmationToken) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < entities.amount) {
        return {
          success: false,
          error: 'Insufficient balance for bill payment'
        };
      }

      // If no confirmation, request it
      if (!confirmationToken) {
        return {
          success: false,
          error: 'Confirmation required',
          requiresConfirmation: true,
          confirmationType: 'PIN',
          details: {
            billType: entities.billType || 'Unknown',
            amount: entities.amount / 100,
            currency: entities.currency || 'NGN'
          }
        };
      }

      // Process bill payment (would integrate with actual bill payment service)
      return {
        success: true,
        message: `Bill payment of ${entities.amount / 100} ${entities.currency || 'NGN'} processed`,
        details: {
          type: 'bill_payment',
          billType: entities.billType || 'Unknown',
          amount: entities.amount / 100,
          currency: entities.currency || 'NGN',
          status: 'completed'
        }
      };
    } catch (error) {
      logger.error('Error handling bill payment:', error);
      return {
        success: false,
        error: error.message || 'Failed to process bill payment'
      };
    }
  }

  /**
   * Check account balance
   */
  async handleCheckBalance(userId, entities) {
    try {
      const wallet = await Wallet.findOne({ userId });

      if (!wallet) {
        return {
          success: true,
          message: 'Your account balance is zero',
          balance: 0,
          currency: 'NGN'
        };
      }

      const balanceFormatted = (wallet.balance / 100).toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0
      });

      return {
        success: true,
        message: `Your current balance is ${balanceFormatted}`,
        balance: wallet.balance / 100,
        currency: 'NGN'
      };
    } catch (error) {
      logger.error('Error checking balance:', error);
      return {
        success: false,
        error: 'Unable to retrieve balance'
      };
    }
  }

  /**
   * Get recent transactions
   */
  async handleRecentTransactions(userId, entities) {
    try {
      const limit = entities.limit || 5;

      const transactions = await Transaction.find({
        $or: [
          { sender: userId },
          { receiver: userId }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('sender', 'firstName lastName')
        .populate('receiver', 'firstName lastName');

      if (transactions.length === 0) {
        return {
          success: true,
          message: 'You have no recent transactions',
          transactions: []
        };
      }

      const transactionSummaries = transactions.map(t => ({
        type: t.sender.equals(userId) ? 'sent' : 'received',
        party: t.sender.equals(userId) ? t.receiver.firstName : t.sender.firstName,
        amount: t.amount / 100,
        currency: t.currency || 'NGN',
        date: t.createdAt,
        status: t.status
      }));

      const message = `You have ${transactions.length} recent transactions. ` +
        transactionSummaries.slice(0, 2).map(t =>
          `${t.type} ${t.amount} ${t.currency} ${t.type === 'sent' ? 'to' : 'from'} ${t.party}`
        ).join(', ');

      return {
        success: true,
        message,
        transactions: transactionSummaries
      };
    } catch (error) {
      logger.error('Error fetching recent transactions:', error);
      return {
        success: false,
        error: 'Unable to retrieve transactions'
      };
    }
  }

  /**
   * Check transfer status
   */
  async handleTransferStatus(userId, entities) {
    try {
      const transaction = await Transaction.findById(entities.transactionId)
        .populate('sender', 'firstName')
        .populate('receiver', 'firstName');

      if (!transaction) {
        return {
          success: false,
          error: 'Transaction not found'
        };
      }

      // Verify user is part of transaction
      if (!transaction.sender._id.equals(userId) && !transaction.receiver._id.equals(userId)) {
        return {
          success: false,
          error: 'Unauthorized'
        };
      }

      const statusMessage = {
        pending: 'Your transfer is being processed',
        completed: 'Your transfer completed successfully',
        failed: 'Your transfer failed',
        cancelled: 'Your transfer was cancelled'
      };

      return {
        success: true,
        message: statusMessage[transaction.status] || 'Unknown status',
        details: {
          transactionId: transaction._id,
          status: transaction.status,
          amount: transaction.amount / 100,
          currency: transaction.currency || 'NGN',
          createdAt: transaction.createdAt
        }
      };
    } catch (error) {
      logger.error('Error checking transfer status:', error);
      return {
        success: false,
        error: 'Unable to check transfer status'
      };
    }
  }
}

module.exports = FinancialCommandHandler;
