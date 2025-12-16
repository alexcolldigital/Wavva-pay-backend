require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:8081').split(','),
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Rate limiting and validation middleware
const { apiLimiter } = require('./middleware/rateLimiter');
const { inputValidator } = require('./middleware/validation');

// Apply middleware
app.use(apiLimiter);
app.use(inputValidator);

// Request logging middleware
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Database connection
if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('user:password')) {
  logger.warn('⚠️ MongoDB URI not configured properly - using local fallback');
  process.env.MONGODB_URI = 'mongodb://localhost:27017/wavva_pay';
}

mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  logger.info('✅ MongoDB connected successfully');
})
.catch(err => {
  logger.error('❌ MongoDB connection failed', err.message);
  logger.warn('💡 Make sure MongoDB is running locally or update MONGODB_URI in .env');
  process.exit(1);
});

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/combines', require('./routes/combines'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/wallets', require('./routes/wallets'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/webhooks', require('./webhooks/chimoney'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📚 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🔒 Security: CORS enabled, Helmet activated`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise,
    reason: reason.message || reason,
  });
});

module.exports = app;
