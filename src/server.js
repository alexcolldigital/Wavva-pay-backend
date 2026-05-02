const path = require('path');
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const logger = require('./utils/logger');
const { setupSocketHandlers } = require('./websockets/socketHandler');
const cbnReporting = require('./services/cbnReporting');
const { inputValidator } = require('./middleware/validation');
const security = require('./utils/security');

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wavva-pay';
mongoose.connect(mongoURI)
  .then(() => {
    logger.info('✅ MongoDB connected successfully');
    console.log('✅ MongoDB connected to:', mongoURI);
  })
  .catch((err) => {
    logger.error('❌ MongoDB connection failed:', err.message);
    console.log('⚠️  Running without MongoDB - some features may be limited');
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

// Enhanced middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

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

// Enhanced body parsing with limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for webhook verification
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Apply input validation globally
app.use(inputValidator);

// Serve static files (for the web app)
app.use(express.static('public'));

// Default route - serve main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Make io instance available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Setup Socket.IO handlers
setupSocketHandlers(io);

// Routes
try {
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/wallets', require('./routes/wallets'));
  app.use('/api/transactions', require('./routes/transactions'));
  app.use('/api/payments', require('./routes/payments'));
  app.use('/api/kyc', require('./routes/kyc'));
  app.use('/api/compliance', require('./routes/compliance'));
  app.use('/api/admin', require('./routes/admin'));
  
  console.log('✅ Core routes loaded successfully');
} catch (error) {
  console.error('❌ Route loading failed:', error.message);
  console.error('Stack:', error.stack);
}

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('[health] Received request');
  res.json({ status: 'ok', timestamp: new Date() });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Wavva Pay API is running!',
    features: [
      'User Authentication',
      'Wallet Management', 
      'Transactions',
      'Bill Payments',
      'KYC Compliance'
    ],
    timestamp: new Date()
  });
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
  // For other requests, serve the main app
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  logger.info(`Server started on port ${PORT}`);
  
  // Start CBN compliance reporting
  if (process.env.NODE_ENV === 'production') {
    cbnReporting.startScheduledReporting();
    console.log('📊 CBN compliance reporting started');
  }
  
  console.log('\n🚀 Advanced Features Available:');
  console.log('   • AI Agent: /api/advanced/ai/*');
  console.log('   • Embedded Finance: /api/advanced/embedded/*');
  console.log('   • Blockchain Assets: /api/advanced/blockchain/*');
  console.log('   • Predictive Insights: /api/advanced/insights/*');
  console.log('   • Voice & Biometric: /api/advanced/voice/* & /api/advanced/biometric/*');
  console.log('   • Gamification: /api/advanced/gamification/*');
  console.log('\n📖 Documentation: ADVANCED_FEATURES.md');
  console.log('\n🌐 Interactive Web App: http://localhost:' + PORT);
  console.log('🧪 Test Client: Open test-client.html in your browser');
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

