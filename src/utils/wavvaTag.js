const logger = require('./logger');

/**
 * Generate a Wavva Tag from username or email
 * Format: #tagname (hashtag style, 5-15 chars, lowercase)
 * @param {string} source - Username or email to generate tag from
 * @returns {string} Generated wavva tag (e.g., #wavvajohn)
 */
const generateWavvaTag = (source) => {
  if (!source) return null;

  // Sanitize source - remove special characters, keep alphanumeric only
  let sanitized = source
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
    .trim();

  // If resulting string is too short, prepend 'wavva'
  if (sanitized.length < 5) {
    sanitized = 'wavva' + sanitized;
  }

  // Truncate to 15 characters
  sanitized = sanitized.substring(0, 15);

  // If still too short (shouldn't happen), pad with random
  if (sanitized.length < 5) {
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    sanitized = 'wavva' + random.substring(0, 10 - sanitized.length);
  }

  return `#${sanitized}`;
};

/**
 * Validate wavva tag format
 * @param {string} tag - Wavva tag to validate
 * @returns {Object} { isValid: boolean, error?: string }
 */
const validateWavvaTag = (tag) => {
  if (!tag) {
    return { isValid: false, error: 'Wavva tag is required' };
  }

  // Must start with #
  if (!tag.startsWith('#')) {
    return { isValid: false, error: 'Wavva tag must start with #' };
  }

  const cleanTag = tag.substring(1); // Remove the # prefix

  // Must be 5-15 characters (after removing #)
  if (cleanTag.length < 5 || cleanTag.length > 15) {
    return { isValid: false, error: 'Wavva tag must be 5-15 characters (excluding #)' };
  }

  // Must be alphanumeric only (lowercase)
  if (!/^[a-z0-9]+$/.test(cleanTag)) {
    return { isValid: false, error: 'Wavva tag can only contain letters and numbers' };
  }

  return { isValid: true };
};

/**
 * Check if wavva tag is already taken in database
 * @param {Object} User - Mongoose User model
 * @param {string} wavvaTag - Tag to check
 * @param {string} excludeUserId - User ID to exclude from check (for updates)
 * @returns {Promise<boolean>} True if tag exists
 */
const isWavvaTagTaken = async (User, wavvaTag, excludeUserId = null) => {
  try {
    const query = { wavvaTag: wavvaTag.toLowerCase() };
    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    const existingUser = await User.findOne(query);
    return !!existingUser;
  } catch (err) {
    logger.error('Error checking wavva tag availability:', err.message);
    throw err;
  }
};

/**
 * Assign default wavva tag to user based on username/email
 * Ensures uniqueness by appending numbers if needed
 * @param {Object} User - Mongoose User model
 * @param {Object} userData - { firstName, lastName, email, username }
 * @returns {Promise<string>} Generated and validated wavva tag
 */
const assignDefaultWavvaTag = async (User, userData) => {
  try {
    let baseTag = generateWavvaTag(
      userData.username || userData.email || `${userData.firstName}${userData.lastName}`
    );

    let wavvaTag = baseTag;
    let counter = 1;
    const maxAttempts = 100;

    // Ensure uniqueness by appending numbers if needed
    while (await isWavvaTagTaken(User, wavvaTag)) {
      if (counter > maxAttempts) {
        throw new Error('Unable to generate unique wavva tag after 100 attempts');
      }

      // Replace the last digit(s) with counter
      const baseWithoutSuffix = baseTag.replace(/#/, '').substring(0, 13); // Keep room for numbers
      wavvaTag = `#${baseWithoutSuffix}${counter}`;
      counter++;
    }

    logger.info(`Generated unique wavva tag: ${wavvaTag}`);
    return wavvaTag;
  } catch (err) {
    logger.error('Error assigning default wavva tag:', err.message);
    throw err;
  }
};

/**
 * Format wavva tag for display (add # if not present)
 * @param {string} tag - Raw tag
 * @returns {string} Formatted tag with #
 */
const formatWavvaTagForDisplay = (tag) => {
  if (!tag) return '';
  return tag.startsWith('#') ? tag : `#${tag}`;
};

/**
 * Extract tag without # prefix
 * @param {string} tag - Tag with or without #
 * @returns {string} Tag without # prefix
 */
const extractWavvaTagValue = (tag) => {
  if (!tag) return '';
  return tag.startsWith('#') ? tag.substring(1) : tag;
};

module.exports = {
  generateWavvaTag,
  validateWavvaTag,
  isWavvaTagTaken,
  assignDefaultWavvaTag,
  formatWavvaTagForDisplay,
  extractWavvaTagValue,
};
