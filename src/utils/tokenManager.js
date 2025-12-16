const jwt = require('jsonwebtoken');
const logger = require('./logger');

const generateAccessToken = (userId) => {
  try {
    return jwt.sign(
      { userId, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  } catch (err) {
    logger.error('Access token generation failed', err.message);
    throw err;
  }
};

const generateRefreshToken = (userId) => {
  try {
    return jwt.sign(
      { userId, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
  } catch (err) {
    logger.error('Refresh token generation failed', err.message);
    throw err;
  }
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    logger.warn('Token verification failed', err.message);
    return null;
  }
};

const generateTokenPair = (userId) => {
  return {
    accessToken: generateAccessToken(userId),
    refreshToken: generateRefreshToken(userId),
  };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  generateTokenPair,
};
