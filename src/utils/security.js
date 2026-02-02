const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class SecurityUtils {
  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
    this.algorithm = 'aes-256-gcm';
    this.saltRounds = parseInt(process.env.HASH_SALT_ROUNDS) || 12;
  }

  // Encrypt sensitive data
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipherGCM(this.algorithm, this.encryptionKey, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
      };
    } catch (error) {
      throw new Error('Encryption failed');
    }
  }

  // Decrypt sensitive data
  decrypt(encryptedData) {
    try {
      const { encrypted, iv, authTag } = encryptedData;
      const decipher = crypto.createDecipherGCM(this.algorithm, this.encryptionKey, Buffer.from(iv, 'hex'));
      
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed');
    }
  }

  // Hash sensitive data (one-way)
  async hash(data) {
    try {
      return await bcrypt.hash(data, this.saltRounds);
    } catch (error) {
      throw new Error('Hashing failed');
    }
  }

  // Verify hashed data
  async verifyHash(data, hash) {
    try {
      return await bcrypt.compare(data, hash);
    } catch (error) {
      throw new Error('Hash verification failed');
    }
  }

  // Generate secure random token
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Generate secure PIN
  generateSecurePIN(length = 6) {
    const digits = '0123456789';
    let pin = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, digits.length);
      pin += digits[randomIndex];
    }
    
    return pin;
  }

  // Mask sensitive data for logging
  maskSensitiveData(data, type = 'default') {
    if (!data) return data;
    
    switch (type) {
      case 'email':
        const [username, domain] = data.split('@');
        return `${username.substring(0, 2)}***@${domain}`;
      
      case 'phone':
        return `***${data.slice(-4)}`;
      
      case 'account':
        return `***${data.slice(-4)}`;
      
      case 'bvn':
        return `***${data.slice(-3)}`;
      
      case 'card':
        return `****-****-****-${data.slice(-4)}`;
      
      default:
        return data.length > 4 ? `***${data.slice(-4)}` : '***';
    }
  }

  // Validate data integrity
  generateChecksum(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  // Verify data integrity
  verifyChecksum(data, checksum) {
    const calculatedChecksum = this.generateChecksum(data);
    return calculatedChecksum === checksum;
  }

  // Secure data comparison (timing attack resistant)
  secureCompare(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  // Generate HMAC signature
  generateHMAC(data, secret) {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  // Verify HMAC signature
  verifyHMAC(data, signature, secret) {
    const calculatedSignature = this.generateHMAC(data, secret);
    return this.secureCompare(signature, calculatedSignature);
  }

  // Sanitize input data
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/['"]/g, '') // Remove quotes
      .replace(/[;]/g, '') // Remove semicolons
      .trim();
  }

  // Validate Nigerian phone number
  validateNigerianPhone(phone) {
    const nigerianPhoneRegex = /^(\+234|234|0)?[789][01]\d{8}$/;
    return nigerianPhoneRegex.test(phone.replace(/\s+/g, ''));
  }

  // Validate BVN
  validateBVN(bvn) {
    const bvnRegex = /^\d{11}$/;
    return bvnRegex.test(bvn);
  }

  // Validate NIN
  validateNIN(nin) {
    const ninRegex = /^\d{11}$/;
    return ninRegex.test(nin);
  }

  // Generate audit trail hash
  generateAuditHash(userId, action, timestamp, data) {
    const auditString = `${userId}:${action}:${timestamp}:${JSON.stringify(data)}`;
    return crypto.createHash('sha256').update(auditString).digest('hex');
  }
}

module.exports = new SecurityUtils();