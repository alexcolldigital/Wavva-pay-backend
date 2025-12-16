const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Wavva Pay API',
      version: '1.0.0',
      description: 'Venom-themed social payment platform API',
      contact: {
        name: 'Wavva Pay Support',
        email: 'support@wavvapay.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000/api',
        description: 'Development server',
      },
      {
        url: 'https://api.wavvapay.com/api',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            profilePicture: { type: 'string' },
            emailVerified: { type: 'boolean' },
            phoneVerified: { type: 'boolean' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            sender: { type: 'string', description: 'User ID' },
            receiver: { type: 'string', description: 'User ID' },
            amount: { type: 'number', description: 'Amount in cents' },
            currency: { type: 'string' },
            type: { 
              type: 'string', 
              enum: ['peer-to-peer', 'combine-split', 'payout'],
            },
            status: { 
              type: 'string', 
              enum: ['pending', 'completed', 'failed', 'cancelled'],
            },
            description: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Wallet: {
          type: 'object',
          properties: {
            balance: { type: 'number', description: 'Balance in cents' },
            currency: { type: 'string' },
            dailyLimit: { type: 'number' },
            monthlyLimit: { type: 'number' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
