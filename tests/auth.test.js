/**
 * Auth Route Tests
 * Tests the /api/auth/register and /api/auth/login endpoints
 */
const request = require('supertest');

// Mock external services to avoid real API calls during tests
jest.mock('../src/services/notifications', () => ({
  sendOTP: jest.fn().mockResolvedValue({ smsSent: true }),
  sendEmailVerificationCode: jest.fn().mockResolvedValue({ emailSent: true }),
}));
jest.mock('../src/modules/flutterwave/flutterwaveService', () =>
  jest.fn().mockImplementation(() => ({
    createVirtualAccount: jest.fn().mockRejectedValue(new Error('Test mode')),
  }))
);
jest.mock('../src/services/wema', () => ({
  createVirtualAccount: jest.fn().mockRejectedValue(new Error('Test mode')),
}));

const { app } = require('../src/server');
const User = require('../src/models/User');
const Wallet = require('../src/models/Wallet');

describe('Authentication Routes', () => {
  beforeAll(async () => {
    // Server already connects to test DB via setup.js env vars
    // Wait for mongoose to be ready
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
  });

  afterAll(async () => {
    // Don't disconnect — other test suites may still need the connection
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
  });

  // ─── REGISTER ────────────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    const validUser = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      password: 'password123',
      phone: '+2348012345678',
    };

    it('should register a new user and return a token', async () => {
      const res = await request(app).post('/api/auth/register').send(validUser);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(validUser.email);
    });

    it('should reject duplicate email', async () => {
      await request(app).post('/api/auth/register').send(validUser);
      const res = await request(app).post('/api/auth/register').send(validUser);

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app).post('/api/auth/register').send({
        firstName: 'John',
        email: 'john@example.com',
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ─── LOGIN ────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'password123',
        phone: '+2348012345678',
      });
    });

    it('should login with correct credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'john@example.com',
        password: 'password123',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('token');
    });

    it('should reject incorrect password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'john@example.com',
        password: 'wrongpassword',
      });

      expect(res.statusCode).toBe(401);
    });

    it('should reject non-existent email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nobody@example.com',
        password: 'password123',
      });

      expect(res.statusCode).toBe(401);
    });

    it('should reject missing credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('should return ok status', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
