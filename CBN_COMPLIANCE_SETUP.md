# CBN Compliance Setup Guide

## Overview
This guide will help you set up the enhanced CBN compliance features for Wavva Pay.

## Prerequisites
- Node.js 18+ and npm 9+
- MongoDB database
- Redis (optional, for caching)

## Installation

### 1. Install New Dependencies
```bash
npm install node-cron uuid
```

Note: `crypto` is a built-in Node.js module and doesn't need to be installed.

### 2. Environment Variables
Add the following to your `.env` file:

```env
# CBN Compliance Configuration
# KYC Verification Services
SMILE_IDENTITY_API_KEY=your-smile-identity-api-key
SMILE_IDENTITY_PARTNER_ID=your-smile-identity-partner-id
SMILE_IDENTITY_BASE_URL=https://3eydmgh10d.execute-api.us-west-2.amazonaws.com/test

# Sanctions Screening
WORLD_CHECK_API_KEY=your-world-check-api-key
WORLD_CHECK_BASE_URL=https://api-worldcheck.refinitiv.com

# CBN Reporting
CBN_REPORTING_ENDPOINT=https://cbn.gov.ng/api/reporting
CBN_INSTITUTION_CODE=your-institution-code
CBN_REPORTING_KEY=your-cbn-reporting-key

# Enhanced Security
ENCRYPTION_KEY=your-32-character-encryption-key-here
HASH_SALT_ROUNDS=12

# Payment Gateways (Required for Nigerian compliance)
PAYSTACK_SECRET_KEY=sk_test_your_paystack_secret_key
PAYSTACK_PUBLIC_KEY=pk_test_your_paystack_public_key
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-your-flutterwave-secret
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-your-flutterwave-public
FLUTTERWAVE_BASE_URL=https://api.flutterwave.com/v3
```

### 3. Third-Party Service Setup

#### Smile Identity (KYC Verification)
1. Sign up at [Smile Identity](https://www.smileidentity.com/)
2. Get your API key and Partner ID
3. Configure webhook endpoints for verification callbacks

#### World-Check (Sanctions Screening)
1. Contact Refinitiv for World-Check API access
2. For development, the system will use fallback basic screening

#### Paystack & Flutterwave
1. Sign up for Nigerian payment gateway accounts
2. Get API keys for both test and production environments

## Database Migration

The new compliance features require updated database schemas. Run the application once to automatically create the new collections:

- Enhanced KYC model with additional fields
- AuditTrail collection for compliance tracking
- Updated AML model with new alert types

## API Endpoints

### New Compliance Endpoints

#### BVN Verification
```
POST /api/compliance/verify-bvn
GET /api/compliance/bvn-status/:jobId
```

#### Enhanced Due Diligence
```
POST /api/compliance/enhanced-due-diligence
```

#### Sanctions Screening
```
POST /api/compliance/sanctions-screening
```

#### CBN Reporting (Admin Only)
```
POST /api/compliance/reports/daily
POST /api/compliance/reports/suspicious-activity
POST /api/compliance/reports/kyc-compliance
```

#### Compliance Dashboard
```
GET /api/compliance/dashboard
GET /api/compliance/risk-assessment/:userId
```

## Scheduled Reporting

The system automatically generates and submits CBN reports:

- **Daily Transaction Reports**: 2:00 AM daily
- **Weekly SAR Reports**: 3:00 AM every Monday
- **Monthly KYC Reports**: 4:00 AM on 1st of each month

Reports are automatically submitted in production mode. In development, they are logged only.

## Testing

### 1. KYC Verification Test
```bash
curl -X POST http://localhost:5000/api/kyc/submit \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "personalInfo": {
      "dateOfBirth": "1990-01-01",
      "nationality": "Nigerian",
      "address": {
        "street": "123 Test Street",
        "city": "Lagos",
        "state": "Lagos",
        "country": "NG",
        "postalCode": "100001"
      },
      "occupation": "Software Developer",
      "sourceOfIncome": "employment"
    },
    "documents": {
      "idType": "national_id",
      "idNumber": "12345678901",
      "idExpiryDate": "2030-12-31",
      "idFrontImage": "base64_encoded_image",
      "selfieImage": "base64_encoded_image",
      "proofOfAddress": "base64_encoded_document"
    }
  }'
```

### 2. BVN Verification Test
```bash
curl -X POST http://localhost:5000/api/compliance/verify-bvn \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bvn": "12345678901"}'
```

### 3. Sanctions Screening Test
```bash
curl -X POST http://localhost:5000/api/compliance/sanctions-screening \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "country": "NG",
    "dateOfBirth": "1990-01-01"
  }'
```

## Security Considerations

1. **Encryption Keys**: Generate strong encryption keys for production
2. **API Keys**: Keep all third-party API keys secure and rotate regularly
3. **Database Security**: Ensure MongoDB is properly secured with authentication
4. **Network Security**: Use HTTPS in production and secure network configurations
5. **Audit Logs**: Monitor audit trails for suspicious activities

## Compliance Monitoring

### Dashboard Access
Admin users can access the compliance dashboard at:
```
GET /api/compliance/dashboard
```

### Audit Trail
All compliance activities are logged in the audit trail:
- Authentication events
- KYC submissions and reviews
- Transaction monitoring
- Compliance checks
- Security events

### Risk Assessment
User risk scores are automatically calculated based on:
- KYC verification status
- Transaction patterns
- AML alert history
- Account age and activity

## Production Deployment

### 1. Environment Setup
- Set `NODE_ENV=production`
- Configure production database connections
- Set up proper logging and monitoring

### 2. Third-Party Services
- Upgrade to production API keys
- Configure webhook endpoints
- Set up monitoring and alerting

### 3. CBN Compliance
- Apply for Payment Service Bank license
- Submit compliance documentation
- Schedule external security audit

## Troubleshooting

### Common Issues

1. **Smile Identity Connection Issues**
   - Verify API keys and partner ID
   - Check network connectivity
   - Review webhook configurations

2. **Sanctions Screening Failures**
   - Fallback to basic screening is automatic
   - Check World-Check API credentials
   - Monitor rate limits

3. **CBN Reporting Issues**
   - Reports are logged in development mode
   - Check CBN endpoint configuration
   - Verify institution code and reporting key

### Logs and Monitoring
- Application logs: `backend_logs.txt`
- Audit trail: MongoDB `audit_trails` collection
- Compliance dashboard for real-time monitoring

## Support

For technical support or compliance questions:
- Email: compliance@wavvapay.com
- Documentation: Check COMPLIANCE_GUIDE.md
- Issues: Create GitHub issues for technical problems