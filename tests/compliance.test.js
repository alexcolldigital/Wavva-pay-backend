const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/server');
const User = require('../src/models/User');
const ComplianceMonitor = require('../src/services/complianceMonitor');

describe('Compliance Features', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('KYC Tier Validation', () => {
    test('should enforce Tier 1 limits', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'Test123!',
        phone: '+2348012345678',
        kycTier: 1,
        dailyTransactionLimit: 100000
      });

      const response = await request(app)
        .post('/api/transactions')
        .send({
          amount: 150000,
          recipient: 'test2@example.com',
          type: 'transfer'
        })
        .set('Authorization', `Bearer ${user.generateAuthToken()}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('exceeds daily limit');
    });

    test('should allow Tier 3 high-value transactions', async () => {
      const user = await User.create({
        email: 'test@example.com',
        password: 'Test123!',
        phone: '+2348012345678',
        kycTier: 3,
        dailyTransactionLimit: 2000000,
        bvn: '12345678901',
        nin: '12345678901'
      });

      const response = await request(app)
        .post('/api/transactions')
        .send({
          amount: 1500000,
          recipient: 'test2@example.com',
          type: 'transfer'
        })
        .set('Authorization', `Bearer ${user.generateAuthToken()}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Nigerian Validations', () => {
    test('should validate BVN format', () => {
      const validBVN = '12345678901';
      const invalidBVN = '123456789';
      
      expect(ComplianceMonitor.validateBVN(validBVN)).toBe(true);
      expect(ComplianceMonitor.validateBVN(invalidBVN)).toBe(false);
    });

    test('should validate Nigerian phone numbers', () => {
      const validPhone = '+2348012345678';
      const invalidPhone = '+1234567890';
      
      expect(ComplianceMonitor.validateNigerianPhone(validPhone)).toBe(true);
      expect(ComplianceMonitor.validateNigerianPhone(invalidPhone)).toBe(false);
    });
  });

  describe('AML Monitoring', () => {
    test('should flag suspicious transaction patterns', async () => {
      const transactions = [
        { amount: 4900000, timestamp: new Date() },
        { amount: 4900000, timestamp: new Date(Date.now() + 60000) },
        { amount: 4900000, timestamp: new Date(Date.now() + 120000) }
      ];

      const riskScore = ComplianceMonitor.calculateRiskScore(transactions);
      expect(riskScore).toBeGreaterThan(70);
    });

    test('should trigger CBN reporting for large transactions', async () => {
      const transaction = { amount: 6000000, type: 'transfer' };
      const shouldReport = ComplianceMonitor.requiresCBNReporting(transaction);
      
      expect(shouldReport).toBe(true);
    });
  });
});