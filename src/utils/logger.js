const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const getCurrentLevel = () => {
  const level = process.env.LOG_LEVEL || 'info';
  return LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
};

const formatLog = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  return {
    timestamp,
    level,
    message,
    ...(data && { data }),
  };
};

const writeLog = (logEntry) => {
  const logFile = path.join(LOG_DIR, `${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
};

const logger = {
  error: (message, data = null) => {
    if (LOG_LEVELS.ERROR <= getCurrentLevel()) {
      const entry = formatLog('ERROR', message, data);
      writeLog(entry);
      console.error(`[ERROR] ${message}`, data);
    }
  },

  warn: (message, data = null) => {
    if (LOG_LEVELS.WARN <= getCurrentLevel()) {
      const entry = formatLog('WARN', message, data);
      writeLog(entry);
      console.warn(`[WARN] ${message}`, data);
    }
  },

  info: (message, data = null) => {
    if (LOG_LEVELS.INFO <= getCurrentLevel()) {
      const entry = formatLog('INFO', message, data);
      writeLog(entry);
      console.log(`[INFO] ${message}`, data);
    }
  },

  debug: (message, data = null) => {
    if (LOG_LEVELS.DEBUG <= getCurrentLevel()) {
      const entry = formatLog('DEBUG', message, data);
      writeLog(entry);
      console.debug(`[DEBUG] ${message}`, data);
    }
  },
};

module.exports = logger;
