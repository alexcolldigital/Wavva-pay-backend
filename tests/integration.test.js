/**
 * Integration Tests — Payment Processor & Compliance
 * Uses nock to mock external HTTP calls
 */
const request = require('supertest');
const nock = require('nock');

jest.mock('../src/services/notifications', () => ({
  sendOTP: jest.fn().mockResolvedValue({ smsSent: true }),
  sendEmailVerificationCode: jest.fn().mockResolvedValue({ emailSent: true }),
}));
jest.mock('../src/modules/flutterwave/flutterwaveService', () =>
  jest.fn().mockImplementation(() => ({
    createVirtualAccount: jest.fn().mockRejectedValue(new Error('Test mode')),
  }))
);

const { app } = require('../src/server');

describe('API Integration Tests', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  // ─── HEALTH ───────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  // ─── API TEST ENDPOINT ────────────────────────────────────────────────────────

  describe('GET /api/test', () => {
    it('returns API info', async () => {
      const res = await request(app).get('/api/test');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('features');
      expect(Array.isArray(res.body.features)).toBe(true);
    });
  });

  // ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

  describe('POST /api/auth/register — validation', () => {
    it('rejects empty body with 400', async () => {
      const res = await request(app).post('/api/auth/register').send({});
      expect(res.status).toBe(400);
    });

    it('rejects missing required fields', async () => {
      const res = await request(app).post('/api/auth/register').send({
        firstName: 'Test',
        // missing lastName, email, password, phone
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── PROTECTED ROUTES ─────────────────────────────────────────────────────────

  describe('Protected routes require auth', () => {
    it('GET /api/wallets returns 401 without token', async () => {
      const res = await request(app).get('/api/wallets');
      expect(res.status).toBe(401);
    });

    it('GET /api/transactions returns 401 without token', async () => {
      const res = await request(app).get('/api/transactions');
      expect(res.status).toBe(401);
    });

    it('POST /api/payments/send returns 401 without token', async () => {
      const res = await request(app).post('/api/payments/send').send({});
      expect(res.status).toBe(401);
    });
  });

  // ─── 404 HANDLING ─────────────────────────────────────────────────────────────

  describe('404 handling', () => {
    it('returns 404 for unknown API routes', async () => {
      const res = await request(app).get('/api/nonexistent-route-xyz');
      expect(res.status).toBe(404);
    });
  });

  // ─── COMPLIANCE MONITOR ───────────────────────────────────────────────────────

  describe('ComplianceMonitor static methods', () => {
    const ComplianceMonitor = require('../src/services/complianceMonitor');

    it('validates BVN correctly', () => {
      expect(ComplianceMonitor.validateBVN('12345678901')).toBe(true);
      expect(ComplianceMonitor.validateBVN('1234')).toBe(false);
    });

    it('validates Nigerian phone numbers', () => {
      expect(ComplianceMonitor.validateNigerianPhone('+2348012345678')).toBe(true);
      expect(ComplianceMonitor.validateNigerianPhone('+1234567890')).toBe(false);
    });

    it('requires CBN reporting for transactions >= ₦5M', () => {
      expect(ComplianceMonitor.requiresCBNReporting({ amount: 5000000 })).toBe(true);
      expect(ComplianceMonitor.requiresCBNReporting({ amount: 4999999 })).toBe(false);
    });

    it('calculates risk score for structuring pattern', () => {
      const txns = [
        { amount: 4900000 },
        { amount: 4800000 },
        { amount: 4950000 },
      ];
      const score = ComplianceMonitor.calculateRiskScore(txns);
      expect(score).toBeGreaterThan(70);
    });
  });
});
