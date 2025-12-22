require('dotenv').config();
const express = require('express');
const { syncDatabase } = require('./models/index_SQL');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');
const path = require('path');

const app = express();

// Parse allowed origins from environment variable
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:8081,http://localhost:3000,https://wavvapay.vercel.app').split(',').map(origin => origin.trim());
logger.info('CORS allowed origins:', allowedOrigins);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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

// Database connection - MySQL with Sequelize
(async () => {
  try {
    // Sync database (create tables if they don't exist)
    await syncDatabase(false); // false = alter tables, true = drop and recreate
    
    logger.info('✅ MySQL Database connected and synchronized');
    
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
        database: 'MySQL',
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
      logger.info(`💾 Database: MySQL`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('❌ Database connection or initialization failed:', error.message);
    logger.warn('💡 Make sure MySQL is running and credentials are correct in .env');
    console.error('Error details:', error);
    process.exit(1);
  }
})();

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise,
    reason: reason.message || reason,
  });
});

module.exports = app;
