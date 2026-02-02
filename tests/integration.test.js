const request = require('supertest');
const nock = require('nock');
const app = require('../src/server');

describe('Payment Processor Integration', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  describe('Paystack Integration', () => {
    test('should initialize payment successfully', async () => {
      nock('https://api.paystack.co')
        .post('/transaction/initialize')
        .reply(200, {
          status: true,
          data: {
            authorization_url: 'https://checkout.paystack.com/test123',
            access_code: 'test_access_code',
            reference: 'test_ref_123'
          }
        });

      const response = await request(app)
        .post('/api/payments/initialize')
        .send({
          amount: 50000,
          email: 'test@example.com',
          processor: 'paystack'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.authorization_url).toBeDefined();
    });

    test('should verify payment successfully', async () => {
      nock('https://api.paystack.co')
        .get('/transaction/verify/test_ref_123')
        .reply(200, {
          status: true,
          data: {
            status: 'success',
            amount: 5000000,
            reference: 'test_ref_123'
          }
        });

      const response = await request(app)
        .get('/api/payments/verify/test_ref_123');

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('success');
    });
  });

  describe('Flutterwave Integration', () => {
    test('should create payment link', async () => {
      nock('https://api.flutterwave.com')
        .post('/v3/payments')
        .reply(200, {
          status: 'success',
          data: {
            link: 'https://checkout.flutterwave.com/test123'
          }
        });

      const response = await request(app)
        .post('/api/payments/initialize')
        .send({
          amount: 75000,
          email: 'test@example.com',
          processor: 'flutterwave'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.link).toBeDefined();
    });
  });

  describe('CBN Compliance Integration', () => {
    test('should report large transactions to CBN', async () => {
      nock('https://api.cbn.gov.ng')
        .post('/reporting/transactions')
        .reply(200, {
          status: 'success',
          reportId: 'CBN_REP_123'
        });

      const response = await request(app)
        .post('/api/transactions')
        .send({
          amount: 6000000, // Above CBN reporting threshold
          recipient: 'test@example.com',
          type: 'transfer'
        });

      expect(response.status).toBe(200);
      expect(response.body.complianceReport).toBeDefined();
    });
  });
});