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
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wavva-pay';
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
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001';
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
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('[health] Received request');
  res.json({ status: 'ok', timestamp: new Date() });
});

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  logger.info(`Server started on port ${PORT}`);
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

