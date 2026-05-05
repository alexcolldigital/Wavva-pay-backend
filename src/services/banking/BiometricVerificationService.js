/**
 * Biometric Verification Service
 * Handles fingerprint, face recognition, and PIN-based verification
 * For transaction confirmation and authentication
 */

class BiometricVerificationService {
  constructor() {
    this.verificationMethods = ['FINGERPRINT', 'FACE_RECOGNITION', 'PIN', 'OTP'];
    this.verificationSessions = new Map();
    this.failedAttempts = new Map();
    this.maxAttempts = 3;
    this.lockoutDuration = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Initialize biometric verification for a transaction
   * @param {string} userId - User ID
   * @param {string} transactionId - Transaction ID
   * @param {string} preferredMethod - Preferred verification method
   * @returns {Promise<object>} Verification session
   */
  async initiateBiometricVerification(userId, transactionId, preferredMethod = 'FINGERPRINT') {
    try {
      // Check if user is locked out due to failed attempts
      if (this.isUserLockedOut(userId)) {
        return {
          success: false,
          error: 'Too many failed attempts. Please try again later.',
          lockedUntil: this.failedAttempts.get(userId).lockedUntil,
        };
      }

      // Get user's enrolled biometric methods
      const enrolledMethods = await this.getUserEnrolledMethods(userId);

      // Determine which method to use
      let verificationMethod = preferredMethod;
      if (!enrolledMethods.includes(preferredMethod)) {
        verificationMethod = enrolledMethods[0] || 'PIN';
      }

      // Create verification session
      const sessionId = this.generateSessionId();
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

      const session = {
        sessionId,
        userId,
        transactionId,
        method: verificationMethod,
        enrolledMethods,
        status: 'PENDING',
        attempts: 0,
        startTime: Date.now(),
        expiresAt,
        verified: false,
      };

      this.verificationSessions.set(sessionId, session);

      return {
        success: true,
        sessionId,
        method: verificationMethod,
        enrolledMethods,
        expiresAt,
        instructions: this.getVerificationInstructions(verificationMethod),
      };
    } catch (error) {
      console.error('Error initiating biometric verification:', error);
      return {
        success: false,
        error: `Verification initiation failed: ${error.message}`,
      };
    }
  }

  /**
   * Get instructions for verification method
   */
  getVerificationInstructions(method) {
    const instructions = {
      FINGERPRINT: 'Place your registered finger on the sensor',
      FACE_RECOGNITION: 'Position your face in the center of the camera',
      PIN: 'Enter your 4-digit PIN',
      OTP: 'Enter the OTP sent to your registered phone number',
    };
    return instructions[method] || 'Complete verification';
  }

  /**
   * Verify biometric data
   * @param {string} sessionId - Verification session ID
   * @param {object} biometricData - Raw biometric data or verification input
   * @returns {Promise<object>} Verification result
   */
  async verifyBiometric(sessionId, biometricData) {
    try {
      const session = this.verificationSessions.get(sessionId);

      if (!session) {
        return {
          success: false,
          error: 'Verification session not found or expired',
        };
      }

      // Check if session has expired
      if (Date.now() > session.expiresAt) {
        this.verificationSessions.delete(sessionId);
        return {
          success: false,
          error: 'Verification session expired. Please try again.',
        };
      }

      // Increment attempts
      session.attempts++;

      // Check if max attempts exceeded
      if (session.attempts > this.maxAttempts) {
        this.verificationSessions.delete(sessionId);
        this.lockUserOut(session.userId);
        return {
          success: false,
          error: 'Too many failed attempts. Account locked temporarily.',
          locked: true,
        };
      }

      // Verify based on method
      let verificationResult;
      switch (session.method) {
        case 'FINGERPRINT':
          verificationResult = await this.verifyFingerprint(
            session.userId,
            biometricData
          );
          break;
        case 'FACE_RECOGNITION':
          verificationResult = await this.verifyFaceRecognition(
            session.userId,
            biometricData
          );
          break;
        case 'PIN':
          verificationResult = await this.verifyPIN(
            session.userId,
            biometricData.pin
          );
          break;
        case 'OTP':
          verificationResult = await this.verifyOTP(
            session.userId,
            biometricData.otp
          );
          break;
        default:
          return {
            success: false,
            error: `Unknown verification method: ${session.method}`,
          };
      }

      if (verificationResult.success) {
        // Mark session as verified
        session.verified = true;
        session.status = 'VERIFIED';
        session.verifiedAt = Date.now();

        // Clear failed attempts for user
        this.failedAttempts.delete(session.userId);

        return {
          success: true,
          sessionId,
          method: session.method,
          message: 'Biometric verification successful',
        };
      } else {
        // Record failed attempt
        session.status = 'FAILED';
        return {
          success: false,
          error: verificationResult.error || 'Verification failed',
          attemptsRemaining: this.maxAttempts - session.attempts,
        };
      }
    } catch (error) {
      console.error('Error verifying biometric:', error);
      return {
        success: false,
        error: `Verification failed: ${error.message}`,
      };
    }
  }

  /**
   * Verify fingerprint against enrolled biometric
   */
  async verifyFingerprint(userId, biometricData) {
    try {
      // TODO: Integrate with device's biometric API
      // Compare fingerprint template with enrolled template
      // This is platform-dependent (iOS uses Touch ID / Face ID, Android uses BiometricPrompt)

      // Simulated verification (in production, use actual biometric SDK)
      const isValid = await this.compareBiometricTemplate(userId, biometricData);

      if (isValid) {
        return {
          success: true,
          confidence: 0.99,
        };
      } else {
        return {
          success: false,
          error: 'Fingerprint does not match',
          confidence: 0.2,
        };
      }
    } catch (error) {
      console.error('Error verifying fingerprint:', error);
      return {
        success: false,
        error: 'Fingerprint verification failed',
      };
    }
  }

  /**
   * Verify face recognition
   */
  async verifyFaceRecognition(userId, biometricData) {
    try {
      // TODO: Integrate with face recognition service (e.g., AWS Rekognition, Firebase ML Kit)
      // Compare face in image/video with enrolled template

      // Simulated verification
      const isValid = await this.compareFaceTemplate(userId, biometricData);

      if (isValid) {
        return {
          success: true,
          confidence: 0.95,
        };
      } else {
        return {
          success: false,
          error: 'Face does not match enrolled template',
          confidence: 0.3,
        };
      }
    } catch (error) {
      console.error('Error verifying face:', error);
      return {
        success: false,
        error: 'Face recognition verification failed',
      };
    }
  }

  /**
   * Verify PIN code
   */
  async verifyPIN(userId, pin) {
    try {
      // Validate PIN format
      if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
        return {
          success: false,
          error: 'Invalid PIN format',
        };
      }

      // TODO: Fetch user's encrypted PIN from database and compare
      // Use bcrypt or similar for secure comparison
      const userPin = await this.getUserPIN(userId);
      const isValid = await this.compareHash(pin, userPin);

      if (isValid) {
        return {
          success: true,
        };
      } else {
        return {
          success: false,
          error: 'Incorrect PIN',
        };
      }
    } catch (error) {
      console.error('Error verifying PIN:', error);
      return {
        success: false,
        error: 'PIN verification failed',
      };
    }
  }

  /**
   * Verify OTP
   */
  async verifyOTP(userId, otp) {
    try {
      if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
        return {
          success: false,
          error: 'Invalid OTP format',
        };
      }

      // TODO: Verify OTP from cache/database
      const storedOTP = await this.getStoredOTP(userId);

      if (!storedOTP) {
        return {
          success: false,
          error: 'OTP expired or not found',
        };
      }

      // Check if OTP matches and not expired
      if (storedOTP.code === otp && Date.now() < storedOTP.expiresAt) {
        // Mark OTP as used
        await this.markOTPAsUsed(userId, otp);
        return {
          success: true,
        };
      } else {
        return {
          success: false,
          error: 'Invalid or expired OTP',
        };
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      return {
        success: false,
        error: 'OTP verification failed',
      };
    }
  }

  /**
   * Check if biometric verification session is valid and verified
   */
  isSessionVerified(sessionId) {
    const session = this.verificationSessions.get(sessionId);
    if (!session) return false;

    if (Date.now() > session.expiresAt) {
      this.verificationSessions.delete(sessionId);
      return false;
    }

    return session.verified && session.status === 'VERIFIED';
  }

  /**
   * Get user's enrolled biometric methods
   */
  async getUserEnrolledMethods(userId) {
    // TODO: Query database for user's enrolled biometric methods
    // For now, return all methods (in production, check what user has actually enrolled)
    return ['FINGERPRINT', 'FACE_RECOGNITION', 'PIN'];
  }

  /**
   * Enroll new biometric method
   */
  async enrollBiometric(userId, method, biometricData) {
    try {
      if (!this.verificationMethods.includes(method)) {
        return {
          success: false,
          error: `Unsupported biometric method: ${method}`,
        };
      }

      // Validate biometric data format
      if (!biometricData) {
        return {
          success: false,
          error: 'Biometric data required',
        };
      }

      // Store encrypted biometric template
      // TODO: Encrypt biometric data before storing
      const enrollmentResult = {
        userId,
        method,
        enrolledAt: new Date(),
        template: this.encryptBiometricData(biometricData),
      };

      // TODO: Store in database
      // await BiometricEnrollment.create(enrollmentResult);

      return {
        success: true,
        message: `${method} enrolled successfully`,
        enrolledAt: enrollmentResult.enrolledAt,
      };
    } catch (error) {
      console.error('Error enrolling biometric:', error);
      return {
        success: false,
        error: `Enrollment failed: ${error.message}`,
      };
    }
  }

  /**
   * Check if user is locked out
   */
  isUserLockedOut(userId) {
    const lockInfo = this.failedAttempts.get(userId);
    if (!lockInfo) return false;

    if (Date.now() > lockInfo.lockedUntil) {
      this.failedAttempts.delete(userId);
      return false;
    }

    return true;
  }

  /**
   * Lock user out temporarily
   */
  lockUserOut(userId) {
    this.failedAttempts.set(userId, {
      lockedAt: Date.now(),
      lockedUntil: Date.now() + this.lockoutDuration,
      reason: 'Too many failed verification attempts',
    });
  }

  /**
   * Helper: Generate verification session ID
   */
  generateSessionId() {
    return `BIO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Helper: Compare biometric templates (simplified)
   */
  async compareBiometricTemplate(userId, newTemplate) {
    // TODO: Implement actual template comparison using ML
    return Math.random() > 0.2; // 80% success rate for demo
  }

  /**
   * Helper: Compare face templates
   */
  async compareFaceTemplate(userId, faceImage) {
    // TODO: Use face recognition SDK (AWS Rekognition, Firebase, etc.)
    return Math.random() > 0.1; // 90% success rate for demo
  }

  /**
   * Helper: Get user's PIN
   */
  async getUserPIN(userId) {
    // TODO: Query database for encrypted PIN
    return null;
  }

  /**
   * Helper: Compare hash
   */
  async compareHash(input, hash) {
    // TODO: Use bcrypt.compare()
    return input === '1234'; // Demo PIN
  }

  /**
   * Helper: Get stored OTP
   */
  async getStoredOTP(userId) {
    // TODO: Query cache/database for OTP
    return null;
  }

  /**
   * Helper: Mark OTP as used
   */
  async markOTPAsUsed(userId, otp) {
    // TODO: Update OTP status in database
  }

  /**
   * Helper: Encrypt biometric data
   */
  encryptBiometricData(data) {
    // TODO: Use encryption library to secure biometric data
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  /**
   * Clean up expired sessions periodically
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.verificationSessions.entries()) {
      if (now > session.expiresAt) {
        this.verificationSessions.delete(sessionId);
      }
    }
  }
}

module.exports = BiometricVerificationService;
