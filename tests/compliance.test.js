const ComplianceMonitor = require('../src/services/complianceMonitor');

describe('Compliance Features', () => {

  describe('Nigerian Validations', () => {
    test('should validate BVN format', () => {
      expect(ComplianceMonitor.validateBVN('12345678901')).toBe(true);
      expect(ComplianceMonitor.validateBVN('123456789')).toBe(false);
      expect(ComplianceMonitor.validateBVN('123456789012')).toBe(false);
    });

    test('should validate Nigerian phone numbers', () => {
      expect(ComplianceMonitor.validateNigerianPhone('+2348012345678')).toBe(true);
      expect(ComplianceMonitor.validateNigerianPhone('+1234567890')).toBe(false);
    });
  });

  describe('AML Monitoring', () => {
    test('should flag suspicious transaction patterns', () => {
      const transactions = [
        { amount: 4900000, timestamp: new Date() },
        { amount: 4900000, timestamp: new Date(Date.now() + 60000) },
        { amount: 4900000, timestamp: new Date(Date.now() + 120000) }
      ];
      const riskScore = ComplianceMonitor.calculateRiskScore(transactions);
      expect(riskScore).toBeGreaterThan(70);
    });

    test('should trigger CBN reporting for large transactions', () => {
      const transaction = { amount: 6000000, type: 'transfer' };
      const shouldReport = ComplianceMonitor.requiresCBNReporting(transaction);
      expect(shouldReport).toBe(true);
    });

    test('should not trigger CBN reporting for small transactions', () => {
      const transaction = { amount: 100000, type: 'transfer' };
      const shouldReport = ComplianceMonitor.requiresCBNReporting(transaction);
      expect(shouldReport).toBe(false);
    });
  });

  describe('KYC Tier Limits', () => {
    test('Tier 1 daily limit should be 100000', () => {
      expect(ComplianceMonitor.getTierLimit(1)).toBe(100000);
    });

    test('Tier 2 daily limit should be 500000', () => {
      expect(ComplianceMonitor.getTierLimit(2)).toBe(500000);
    });

    test('Tier 3 daily limit should be 2000000', () => {
      expect(ComplianceMonitor.getTierLimit(3)).toBe(2000000);
    });
  });
});
