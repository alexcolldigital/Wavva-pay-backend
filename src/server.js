// Wema/ALAT Product Routes (moved below, after app is initialized)
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const logger = require('./utils/logger');
const { setupSocketHandlers } = require('./websockets/socketHandler');

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/wavvapay';
mongoose.connect(mongoURI)
  .then(() => {
    logger.info('✅ MongoDB connected successfully');
  })
  .catch((err) => {
    logger.error('❌ MongoDB connection failed:', err.message);
    // Continue anyway - don't crash the server
  });

// Parse allowed origins from environment
const getAllowedOrigins = () => {
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || 
    'http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:8081,http://localhost:8082,http://127.0.0.1:8081,http://127.0.0.1:8082';
  return allowedOriginsEnv.split(',').map(origin => origin.trim());
};

const allowedOrigins = getAllowedOrigins();
logger.info('✅ Allowed CORS origins:', allowedOrigins);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Make io instance available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Setup Socket.IO handlers
setupSocketHandlers(io);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/wallets', require('./routes/wallets'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/combines', require('./routes/combines'));
app.use('/api/payment-requests', require('./routes/paymentRequests'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/support', require('./routes/support'));
app.use('/api/voice', require('./routes/voice'));
app.use('/api/banking', require('./routes/banking'));
app.use('/api/admin', require('./routes/admin'));

// KYC Routes
app.use('/api/kyc/user', require('./routes/userKYC'));
app.use('/api/kyc/merchant', require('./routes/kyc'));
app.use('/api/kyc-tiers', require('./routes/kyc-tiers'));

// Document Upload Routes
app.use('/api/documents', require('./routes/documents'));

// Wema/ALAT Product Routes
// Virtual account is now handled via Flutterwave to support static permanent VA
app.use('/api/flutterwave/virtual-account', require('./routes/wema/virtualAccountRoutes'));
app.use('/api/wema/nip-transfer', require('./routes/wema/nipTransferRoutes'));
app.use('/api/wema/account-verification', require('./routes/wema/accountVerificationRoutes'));
app.use('/api/wema/bank-list', require('./routes/wema/bankListRoutes'));
app.use('/api/wema/settlement', require('./routes/wema/settlementRoutes'));
app.use('/api/wema/customer-identification', require('./routes/wema/customerIdentificationRoutes'));

// Flutterwave Routes
app.use('/api/flutterwave', require('./routes/flutterwave'));

// Group Payment Routes
app.use('/api/group-payments', require('./routes/groupPayments'));

// Merchant Routes
app.use('/api/merchant', require('./routes/merchant'));
app.use('/api/merchant/dashboard', require('./routes/merchantDashboard'));
app.use('/api/merchant/settlement', require('./routes/settlement'));
app.use('/api/merchant/subscriptions', require('./routes/subscriptions'));
app.use('/api/invoices', require('./routes/invoices'));

// Webhook Routes
app.use('/api/webhooks', require('./webhooks/flutterwave'));
app.use('/api/webhooks', require('./webhooks/wema'));
app.use('/api/webhooks', require('./webhooks/chimoney'));

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('[health] Received request');
  res.json({ status: 'ok', timestamp: new Date() });
});

// Favicon handler
app.get('/favicon.ico', (req, res) => {
  res.status(204).send();
});

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// 404 Error handling for non-API routes (for SPA routing on frontend)
app.use((err, req, res, next) => {
  logger.error('Unhandled error', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// 404 handler - MUST be last
app.use((req, res) => {
  // If it's an API request and route not found
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  // For other requests, return 200 OK (frontend will handle routing)
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  logger.info(`Server started on port ${PORT}`);

  // Initialize scheduled jobs
  if (process.env.NODE_ENV !== 'test') {
    try {
      const { startSettlementCron, startRetryCheckCron } = require('./services/settlementCron');
      const { startRecurringBillingCron } = require('./services/recurringBillingCron');
      startSettlementCron();     // Daily settlement execution at 9 AM UTC
      startRetryCheckCron();     // Retry failed settlements every 4 hours
      startRecurringBillingCron(); // Recurring billing at 2 AM UTC
      logger.info('✅ Scheduled cron jobs initialized');
    } catch (error) {
      logger.error('Failed to initialize cron jobs:', error.message);
    }
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Error handlers
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION', err.message);
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION', reason);
  console.error('UNHANDLED REJECTION:', reason);
});

module.exports = { app, server, io };

