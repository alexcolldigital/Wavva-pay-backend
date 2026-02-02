const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Wavva Pay API',
      version: '1.0.0',
      description: 'CBN-Compliant Nigerian Fintech API',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development server' },
      { url: 'https://api.wavvapay.com', description: 'Production server' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            phone: { type: 'string', pattern: '^\\+234[0-9]{10}$' },
            kycTier: { type: 'integer', enum: [1, 2, 3] },
            bvn: { type: 'string', pattern: '^[0-9]{11}$' },
            nin: { type: 'string', pattern: '^[0-9]{11}$' },
            dailyTransactionLimit: { type: 'number' },
            riskScore: { type: 'number', minimum: 0, maximum: 100 }
          }
        },
        Transaction: {
          type: 'object',
          properties: {
            amount: { type: 'number', minimum: 1 },
            recipient: { type: 'string' },
            type: { type: 'string', enum: ['transfer', 'payment', 'withdrawal'] },
            status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
            complianceFlags: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js']
};

module.exports = swaggerJsdoc(options);