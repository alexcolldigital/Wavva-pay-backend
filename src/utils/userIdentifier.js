/**
 * User identification utility for generating unique userIds and validating usernames
 */

/**
 * Generate a unique user ID (e.g., @user_12345abc)
 * Format: @username_randomstring
 */
const generateUserId = (username) => {
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `@${username}_${randomStr}`;
};

/**
 * Validate username format
 * - 3-20 characters
 * - Alphanumeric and underscores only
 * - Lowercase
 */
const validateUsername = (username) => {
  if (!username) return false;
  
  const usernameRegex = /^[a-z0-9_]{3,20}$/;
  return usernameRegex.test(username.toLowerCase());
};

/**
 * Validate phone number format (basic)
 * Accepts: 10-15 digits, with optional + at start
 */
const validatePhone = (phone) => {
  if (!phone) return false;
  
  const phoneRegex = /^\+?[1-9]\d{9,14}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

/**
 * Format phone for storage (remove spaces, standardize)
 */
const formatPhone = (phone) => {
  return phone.replace(/\s/g, '').replace(/^0/, '+234');
};

/**
 * Parse user identifier (could be username, phone, or userId)
 * Returns: { type: 'username' | 'phone' | 'userId', value: string }
 */
const parseUserIdentifier = (identifier) => {
  if (!identifier || typeof identifier !== 'string') {
    return null;
  }

  identifier = identifier.trim();

  // Check if it's a userId (starts with @)
  if (identifier.startsWith('@')) {
    return { type: 'userId', value: identifier };
  }

  // Check if it's a phone number (starts with + or contains only digits)
  if (identifier.startsWith('+') || /^\d{10,}$/.test(identifier)) {
    return { type: 'phone', value: formatPhone(identifier) };
  }

  // Otherwise treat as username
  if (validateUsername(identifier)) {
    return { type: 'username', value: identifier.toLowerCase() };
  }

  return null;
};

module.exports = {
  generateUserId,
  validateUsername,
  validatePhone,
  formatPhone,
  parseUserIdentifier,
};
