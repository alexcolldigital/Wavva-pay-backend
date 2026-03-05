/**
 * Transaction State Manager
 * Manages the lifecycle and state transitions of banking transactions
 * Handles: pending, confirmed, processing, completed, failed, refunded
 */

class TransactionStateManager {
  constructor() {
    this.transactionStates = new Map();
    this.stateHistory = new Map();
    this.stateTransitions = this.initializeStateTransitions();
    this.listeners = new Map(); // State change listeners
  }

  /**
   * Initialize valid state transitions
   */
  initializeStateTransitions() {
    return {
      INITIATED: ['PENDING_BIOMETRIC', 'CANCELLED'],
      PENDING_BIOMETRIC: ['CONFIRMED', 'BIOMETRIC_FAILED', 'TIMEOUT', 'CANCELLED'],
      CONFIRMED: ['PROCESSING', 'CANCELLED'],
      PROCESSING: ['IN_TRANSIT', 'FAILED', 'TIMEOUT'],
      IN_TRANSIT: ['COMPLETED', 'FAILED'],
      COMPLETED: ['REFUND_INITIATED'],
      FAILED: ['RETRY_PROCESSING', 'REFUNDED'],
      MAILED: ['COMPLETED', 'FAILED'],
      REFUND_INITIATED: ['REFUNDED', 'REFUND_FAILED'],
      REFUNDED: [],
      CANCELLED: [],
      TIMEOUT: ['CANCELLED'],
      BIOMETRIC_FAILED: ['PENDING_BIOMETRIC', 'CANCELLED'],
      RETRY_PROCESSING: ['IN_TRANSIT', 'FAILED'],
    };
  }

  /**
   * Create transaction state entry
   */
  createTransactionState(transactionId, transactionData) {
    const state = {
      transactionId,
      currentState: 'INITIATED',
      previousState: null,
      metadata: transactionData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stateChanges: [
        {
          state: 'INITIATED',
          timestamp: Date.now(),
          reason: 'Transaction created',
        },
      ],
      confirmationData: null,
      processingData: null,
      completionData: null,
    };

    this.transactionStates.set(transactionId, state);
    this.stateHistory.set(transactionId, [state]);

    return state;
  }

  /**
   * Transition to new state
   */
  async transitionState(transactionId, newState, reason = '', data = {}) {
    try {
      const state = this.transactionStates.get(transactionId);
      if (!state) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      // Validate transition is allowed
      const validTransitions = this.stateTransitions[state.currentState] || [];
      if (!validTransitions.includes(newState)) {
        throw new Error(
          `Invalid state transition from ${state.currentState} to ${newState}`
        );
      }

      // Record previous state
      const oldState = state.currentState;
      state.previousState = oldState;
      state.currentState = newState;
      state.updatedAt = Date.now();

      // Record state change
      state.stateChanges.push({
        state: newState,
        timestamp: Date.now(),
        reason,
        data,
      });

      // Update state-specific data
      this.updateStateData(state, newState, data);

      // Call listeners
      await this.notifyStateChange(transactionId, oldState, newState, data);

      // Add to history
      const history = this.stateHistory.get(transactionId) || [];
      history.push({ ...state });
      this.stateHistory.set(transactionId, history);

      return {
        success: true,
        transactionId,
        previousState: oldState,
        currentState: newState,
        changedAt: state.updatedAt,
      };
    } catch (error) {
      console.error('Error transitioning state:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update state-specific data
   */
  updateStateData(state, newState, data) {
    switch (newState) {
      case 'PENDING_BIOMETRIC':
        state.confirmationData = {
          biometricSessionId: data.sessionId,
          initiatedAt: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000,
        };
        break;

      case 'CONFIRMED':
        state.confirmationData = {
          ...state.confirmationData,
          confirmedAt: Date.now(),
          confirmationMethod: data.method,
        };
        break;

      case 'PROCESSING':
        state.processingData = {
          processedBy: data.processor,
          queuePosition: data.queuePosition,
          startedAt: Date.now(),
          estimatedCompletion: Date.now() + 30 * 1000, // 30 seconds
        };
        break;

      case 'IN_TRANSIT':
        state.processingData = {
          ...state.processingData,
          inTransitAt: Date.now(),
          status: 'IN_TRANSIT',
        };
        break;

      case 'COMPLETED':
        state.completionData = {
          completedAt: Date.now(),
          finalAmount: data.finalAmount,
          fees: data.fees,
          reference: data.reference,
        };
        break;

      case 'FAILED':
        state.completionData = {
          failedAt: Date.now(),
          failureReason: data.reason,
          errorCode: data.errorCode,
          retryable: data.retryable !== false,
        };
        break;

      case 'REFUNDED':
        state.completionData = {
          ...state.completionData,
          refundedAt: Date.now(),
          refundAmount: data.refundAmount,
          refundReference: data.reference,
        };
        break;

      default:
        break;
    }
  }

  /**
   * Get current state
   */
  getState(transactionId) {
    return this.transactionStates.get(transactionId);
  }

  /**
   * Get full state history
   */
  getStateHistory(transactionId) {
    return this.stateHistory.get(transactionId) || [];
  }

  /**
   * Register listener for state changes
   */
  onStateChange(transactionId, callback) {
    if (!this.listeners.has(transactionId)) {
      this.listeners.set(transactionId, []);
    }
    this.listeners.get(transactionId).push(callback);
  }

  /**
   * Notify state change listeners
   */
  async notifyStateChange(transactionId, oldState, newState, data) {
    const callbacks = this.listeners.get(transactionId) || [];
    for (const callback of callbacks) {
      try {
        await callback({
          transactionId,
          oldState,
          newState,
          data,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error('Error in state change listener:', error);
      }
    }
  }

  /**
   * Check if state is terminal (no further transitions)
   */
  isTerminalState(state) {
    const terminalStates = ['COMPLETED', 'REFUNDED', 'CANCELLED'];
    return terminalStates.includes(state);
  }

  /**
   * Check if transaction is in error state
   */
  isErrorState(state) {
    const errorStates = ['FAILED', 'TIMEOUT', 'BIOMETRIC_FAILED'];
    return errorStates.includes(state);
  }

  /**
   * Get state progress percentage
   */
  getProgress(transactionId) {
    const state = this.getState(transactionId);
    if (!state) return 0;

    const progressMap = {
      INITIATED: 10,
      PENDING_BIOMETRIC: 25,
      CONFIRMED: 40,
      PROCESSING: 60,
      IN_TRANSIT: 80,
      COMPLETED: 100,
      FAILED: 0,
      CANCELLED: 0,
      REFUNDED: 100,
    };

    return progressMap[state.currentState] || 0;
  }

  /**
   * Get human-readable status message
   */
  getStatusMessage(transactionId) {
    const state = this.getState(transactionId);
    if (!state) return 'Transaction not found';

    const messages = {
      INITIATED: 'Transaction initiated',
      PENDING_BIOMETRIC: 'Awaiting biometric verification',
      CONFIRMED: 'Confirmed - processing',
      PROCESSING: 'Processing transaction',
      IN_TRANSIT: 'In transit to recipient',
      COMPLETED: '✓ Transaction completed successfully',
      FAILED: '✗ Transaction failed',
      CANCELLED: 'Transaction cancelled',
      TIMEOUT: 'Transaction timed out',
      BIOMETRIC_FAILED: 'Biometric verification failed',
      REFUNDED: '↻ Refund completed',
      REFUND_INITIATED: 'Refund in progress',
    };

    return messages[state.currentState] || 'Unknown status';
  }

  /**
   * Get estimated time remaining
   */
  getTimeRemaining(transactionId) {
    const state = this.getState(transactionId);
    if (!state || !state.processingData) return null;

    const estimated = state.processingData.estimatedCompletion;
    const now = Date.now();

    if (estimated > now) {
      return estimated - now;
    }
    return null;
  }

  /**
   * Check if transaction can be retried
   */
  canRetry(transactionId) {
    const state = this.getState(transactionId);
    if (!state) return false;

    if (state.currentState === 'FAILED' && state.completionData?.retryable) {
      return true;
    }

    if (state.currentState === 'TIMEOUT') {
      return true;
    }

    if (state.currentState === 'BIOMETRIC_FAILED') {
      return true;
    }

    return false;
  }

  /**
   * Check if transaction can be cancelled
   */
  canCancel(transactionId) {
    const state = this.getState(transactionId);
    if (!state) return false;

    const cancellableStates = ['INITIATED', 'PENDING_BIOMETRIC', 'CONFIRMED'];
    return cancellableStates.includes(state.currentState);
  }

  /**
   * Check if transaction can be refunded
   */
  canRefund(transactionId) {
    const state = this.getState(transactionId);
    if (!state) return false;

    return state.currentState === 'COMPLETED';
  }

  /**
   * Get transaction timeline
   */
  getTimeline(transactionId) {
    const history = this.getStateHistory(transactionId);
    return history.map((state) => ({
      state: state.currentState,
      timestamp: state.updatedAt,
      reason:
        state.stateChanges[state.stateChanges.length - 1]?.reason || 'N/A',
    }));
  }

  /**
   * Cleanup old states (for memory management)
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const keysToDelete = [];

    for (const [txId, state] of this.transactionStates.entries()) {
      if (
        this.isTerminalState(state.currentState) &&
        now - state.updatedAt > maxAge
      ) {
        keysToDelete.push(txId);
      }
    }

    keysToDelete.forEach((txId) => {
      this.transactionStates.delete(txId);
      this.listeners.delete(txId);
    });

    return keysToDelete.length;
  }
}

module.exports = TransactionStateManager;
