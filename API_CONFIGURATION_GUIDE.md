# API Configuration Guide

## Overview
WavvaPay uses a multi-API architecture to provide comprehensive financial services. Each API is specialized for specific functionality to ensure optimal performance and compliance.

## API Assignments

### 🔄 Wema API → Bank + Accounts
**Primary Use Cases:**
- Real bank account linking and verification
- Interbank transfers (NIP transfers)
- Account balance inquiries
- Bank list retrieval
- Settlement account management

**Endpoints:**
- `/api/wema/nip-transfer/*` - Interbank transfers
- `/api/wema/account-verification/*` - Account verification
- `/api/wema/bank-list/*` - Bank directory services
- `/api/wema/settlement/*` - Settlement operations

### 💠 Flutterwave Static Virtual Accounts
**Primary Use Cases:**
- Static/permanent virtual accounts (one per user)
- Virtual account deposits and reconciliation
- Webhook-based settlement processing

**Endpoints:**
- `/api/flutterwave/virtual-account/*` - Virtual account operations

**Important:** Flutterwave static VA creation requires either BVN or NIN. The system now attempts to resolve identity from:
- `User.bvn` or `User.nin` (preferred)
- `UserKYC.idType` + `UserKYC.idNumber` (from KYC uploads)
- legacy `User.kyc` fields as fallback

Ensure KYC is verified before attempting virtual account creation to prevent:
- `BVN or NIN is required for static account number creation`

**Configuration:**
```env
WEMA_API_KEY=your_production_wema_api_key
WEMA_API_SECRET=your_production_wema_api_secret
WEMA_MERCHANT_ID=your_production_wema_merchant_id
WEMA_BASE_URL=https://wema-alatdev-apimgt.azure-api.net/
WEMA_SETTLEMENT_ACCOUNT_NUMBER=your_production_settlement_account_number
```

### 💳 Flutterwave API → Payments
**Primary Use Cases:**
- Card payments (credit/debit cards)
- Mobile money payments
- Bill payments (utilities, DSTV, etc.)
- Airtime top-up
- Data bundle purchases
- USSD payments
- Payment verification and webhooks

**Endpoints:**
- `/api/flutterwave/payment/*` - Payment processing
- `/api/flutterwave/transfer/*` - Money transfers
- `/api/payments/*` - General payment operations
- `/api/webhooks/flutterwave` - Payment webhooks

**Configuration:**
```env
FLUTTERWAVE_SECRET_KEY=FLWSECK_PROD-your_production_flutterwave_secret_key
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_PROD-your_production_flutterwave_public_key
FLUTTERWAVE_BASE_URL=https://api.flutterwave.com/v3
```

## Service Architecture

### Backend Services
- `flutterwave.js` - Flutterwave payment operations
- `wema.js` - Wema bank and account operations
- `paymentsController.js` - Unified payment processing
- `bankingController.js` - Banking operations

### Route Structure
```javascript
// Wema Bank Routes (Bank + Accounts)
app.use('/api/wema/virtual-account', virtualAccountRoutes);
app.use('/api/wema/nip-transfer', nipTransferRoutes);
app.use('/api/wema/account-verification', accountVerificationRoutes);
app.use('/api/wema/bank-list', bankListRoutes);
app.use('/api/wema/settlement', settlementRoutes);

// Flutterwave Routes (Payments)
app.use('/api/flutterwave', flutterwaveRoutes);
app.use('/api/payments', paymentRoutes);
```

## Integration Guidelines

### When to Use Wema API
- Creating virtual accounts for users
- Processing interbank transfers
- Verifying bank account details
- Managing settlement accounts
- Retrieving bank directory information

### When to Use Flutterwave API
- Processing card payments
- Handling mobile money transactions
- Paying utility bills
- Purchasing airtime/data bundles
- USSD-based payments
- Payment verification and reconciliation

### Error Handling
- Both APIs have comprehensive error handling
- Failed transactions are logged and retried where appropriate
- Webhooks ensure real-time status updates
- Fallback mechanisms for API downtime

## Security Considerations

### API Keys
- All API keys are stored as environment variables
- Never commit API keys to version control
- Use production keys only in production environment
- Rotate keys regularly for security

### Webhooks
- Webhook endpoints are secured with signature verification
- All webhook events are logged for audit trails
- Duplicate event handling prevents double processing

### Compliance
- PCI DSS compliance for card payments (Flutterwave)
- CBN compliance for banking operations (Wema)
- KYC/AML checks integrated into both flows

## Testing

### Sandbox Environment
- Wema: Use sandbox credentials for testing
- Flutterwave: Use test keys for development

### Production Deployment
- Ensure all production API keys are configured
- Test all payment flows before going live
- Monitor webhook delivery and processing
- Set up proper error alerting

## Support

For API-related issues:
- Wema API: Contact Wema Bank ALAT support
- Flutterwave API: Contact Flutterwave developer support
- WavvaPay: Check backend logs and webhook delivery</content>
<parameter name="filePath">c:\Users\WINDOWS 10\Music\WavvaPay\API_CONFIGURATION_GUIDE.md