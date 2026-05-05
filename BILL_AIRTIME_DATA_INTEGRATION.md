# Bill Payment, Airtime & Data Bundle Integration

## Overview

The Wavva Pay backend now supports comprehensive bill payments, airtime purchases, and data bundle subscriptions through **OnePipe's unified API**. This enables users to pay utility bills, buy mobile airtime, and purchase data plans directly from their wallets.

## Features Implemented

### 1. **Bill Payments**
- **Electricity**: NEPA, EKEDC, IKEDC, KEDCO (Post-paid and Pre-paid)
- **Water**: Lagos Water Corporation, Port Harcourt Water
- **Internet**: Smile Telecom, Swift Networks
- **Cable TV**: DStv, GoTV, Startimes
- Real-time payment processing via OnePipe
- Commission tracking to internal ledger
- Transaction history recording

### 2. **Airtime Purchases**
- **Networks Supported**: MTN, GLO, Airtel, 9Mobile
- **Minimum Amount**: ₦50
- **Maximum Amount**: ₦100,000
- Instant airtime credit to phone
- Commission recording for airtime sales

### 3. **Data Bundles**
- **Network-Specific Plans**: Customized data plans per network
- **Available Networks**: MTN, GLO, Airtel, 9Mobile
- **Plan Examples**:
  - MTN: 250MB, 1GB, 2GB, 5GB, 10GB, 20GB
  - GLO: 171MB, 1GB, 3GB, 7GB, 14GB
  - Airtel: 250MB, 1GB, 2GB, 5GB, 10GB
  - 9Mobile: 500MB, 1.5GB, 3.5GB, 8.5GB, 20GB
- Auto-renewal options
- Volume-based pricing

## API Endpoints

### Bill Payment Endpoints

#### 1. Pay a Bill
**Endpoint**: `POST /api/payments/bill/pay`

**Authentication**: Required (Bearer token)

**Request Body**:
```json
{
  "providerId": "NE1001",
  "accountNumber": "12345678",
  "amount": 5000
}
```

**Provider IDs**:
```
Electricity:
- NE1001: NEPA (Post-paid)
- NE1002: NEPA (Pre-paid)
- NE1003: EKEDC (Post-paid)
- NE1004: EKEDC (Pre-paid)
- NE1005: IKEDC (Post-paid)
- NE1006: IKEDC (Pre-paid)
- NE1007: KEDCO (Post-paid)
- NE1008: KEDCO (Pre-paid)

Water:
- WA1001: Lagos Water Corporation
- WA1002: Port Harcourt Water

Internet:
- IN1001: Smile Telecom
- IN1002: Swift Networks

Cable:
- CB1001: DStv
- CB1002: GoTV
- CB1003: Startimes
```

**Response** (Success):
```json
{
  "success": true,
  "transactionId": "61f2d3e4c5a6b7e8f9g0h1i2",
  "reference": "REQ-1709487320521-abc123",
  "amount": 5000,
  "currency": "NGN",
  "status": "completed",
  "newBalance": 45000,
  "message": "Bill payment successful"
}
```

**Response** (Error):
```json
{
  "error": "Insufficient balance",
  "balance": 3000,
  "required": 5000
}
```

#### 2. Get Bill Providers
**Endpoint**: `GET /api/payments/bill/providers`

**Authentication**: Required

**Query Parameters**:
- `category` (optional): `electricity`, `water`, `internet`, `cable`

**Response** (All categories):
```json
{
  "success": true,
  "providers": {
    "electricity": [
      { "id": "NE1001", "name": "NEPA (Post-paid)", "category": "electricity" },
      { "id": "NE1002", "name": "NEPA (Pre-paid)", "category": "electricity" },
      ...
    ],
    "water": [...],
    "internet": [...],
    "cable": [...]
  },
  "categories": ["electricity", "water", "internet", "cable"]
}
```

**Response** (Specific category):
```json
{
  "success": true,
  "category": "electricity",
  "providers": [
    { "id": "NE1001", "name": "NEPA (Post-paid)", "category": "electricity" },
    { "id": "NE1002", "name": "NEPA (Pre-paid)", "category": "electricity" }
  ],
  "count": 8
}
```

### Airtime Endpoints

#### 1. Buy Airtime
**Endpoint**: `POST /api/payments/airtime/buy`

**Authentication**: Required

**Request Body**:
```json
{
  "networkCode": "MTN",
  "phoneNumber": "08012345678",
  "amount": 500
}
```

**Network Codes**:
- `MTN` or `mtn`
- `GLO` or `glo`
- `AIRTEL` or `airtel`
- `9MOBILE` or `9mobile`

**Response** (Success):
```json
{
  "success": true,
  "transactionId": "61f2d3e4c5a6b7e8f9g0h1i2",
  "reference": "REQ-1709487320521-abc123",
  "amount": 500,
  "phoneNumber": "08012345678",
  "network": "MTN",
  "currency": "NGN",
  "status": "completed",
  "newBalance": 44500,
  "message": "Airtime purchase successful for 08012345678"
}
```

**Error Response**:
```json
{
  "error": "Insufficient balance",
  "balance": 200,
  "required": 500
}
```

### Data Bundle Endpoints

#### 1. Buy Data Bundle
**Endpoint**: `POST /api/payments/data/buy`

**Authentication**: Required

**Request Body**:
```json
{
  "networkCode": "MTN",
  "phoneNumber": "08012345678",
  "dataPlanId": "5GB",
  "amount": 5000
}
```

**Response** (Success):
```json
{
  "success": true,
  "transactionId": "61f2d3e4c5a6b7e8f9g0h1i2",
  "reference": "REQ-1709487320521-abc123",
  "amount": 5000,
  "phoneNumber": "08012345678",
  "network": "MTN",
  "dataPlan": "5GB",
  "currency": "NGN",
  "status": "completed",
  "newBalance": 40000,
  "message": "Data bundle 5GB purchase successful for 08012345678"
}
```

#### 2. Get Available Data Plans
**Endpoint**: `GET /api/payments/data/plans`

**Authentication**: Required

**Query Parameters**:
- `networkCode` (required): `MTN`, `GLO`, `AIRTEL`, or `9MOBILE`

**Response**:
```json
{
  "success": true,
  "network": "MTN",
  "plans": [
    {
      "id": "250MB",
      "name": "250MB",
      "price": 25000,
      "duration": "7 days"
    },
    {
      "id": "1GB",
      "name": "1GB",
      "price": 100000,
      "duration": "7 days"
    },
    {
      "id": "5GB",
      "name": "5GB",
      "price": 500000,
      "duration": "30 days"
    },
    ...
  ],
  "count": 6
}
```

**Sample Data Plans**:

**MTN**:
- 250MB - ₦250 (7 days)
- 1GB - ₦1,000 (7 days)
- 2GB - ₦2,000 (7 days)
- 5GB - ₦5,000 (30 days)
- 10GB - ₦10,000 (30 days)
- 20GB - ₦20,000 (30 days)

**GLO**:
- 171MB - ₦250 (7 days)
- 1GB - ₦1,000 (7 days)
- 3GB - ₦2,500 (7 days)
- 7GB - ₦5,000 (30 days)
- 14GB - ₦10,000 (30 days)

**AIRTEL**:
- 250MB - ₦250 (7 days)
- 1GB - ₦1,000 (7 days)
- 2GB - ₦2,000 (7 days)
- 5GB - ₦5,000 (30 days)
- 10GB - ₦10,000 (30 days)

**9MOBILE**:
- 500MB - ₦250 (7 days)
- 1.5GB - ₦1,000 (7 days)
- 3.5GB - ₦2,000 (7 days)
- 8.5GB - ₦5,000 (30 days)
- 20GB - ₦10,000 (30 days)

## Commission Tracking

All bill payments, airtime, and data purchases automatically record commissions to the `CommissionLedger` for analytics and reporting.

**Commission Rate**: 1.5% (configurable per user)

**Examples**:
- Bill payment of ₦5,000 → Commission: ₦75
- Airtime of ₦1,000 → Commission: ₦15
- Data bundle of ₦5,000 → Commission: ₦75

**Commission Ledger Fields**:
```javascript
{
  transactionId: ObjectId,
  userId: ObjectId,
  type: 'bill_payment' | 'airtime' | 'data_bundle',
  amount: Number (in kobo),
  commission: Number (in kobo),
  method: 'onepipe',
  status: 'recorded',
  createdAt: Date
}
```

## Transaction Recording

Each transaction creates a `Transaction` record with appropriate metadata:

**Bill Payment Transaction**:
```javascript
{
  sender: userId,
  receiver: null,
  amount: amountInKobo,
  currency: 'NGN',
  type: 'bill_payment',
  method: 'onepipe',
  status: 'completed' | 'pending',
  paystackReference: reference,
  metadata: {
    providerId: 'NE1001',
    accountNumber: '12345678',
    billType: 'utility'
  }
}
```

**Airtime Transaction**:
```javascript
{
  sender: userId,
  receiver: null,
  amount: amountInKobo,
  currency: 'NGN',
  type: 'airtime',
  method: 'onepipe',
  status: 'completed' | 'pending',
  paystackReference: reference,
  metadata: {
    networkCode: 'MTN',
    phoneNumber: '08012345678',
    serviceType: 'airtime'
  }
}
```

**Data Bundle Transaction**:
```javascript
{
  sender: userId,
  receiver: null,
  amount: amountInKobo,
  currency: 'NGN',
  type: 'data_bundle',
  method: 'onepipe',
  status: 'completed' | 'pending',
  paystackReference: reference,
  metadata: {
    networkCode: 'MTN',
    phoneNumber: '08012345678',
    dataPlanId: '5GB',
    serviceType: 'data'
  }
}
```

## Wallet Integration

### Balance Deduction
- User's wallet is debited immediately upon successful payment
- Amount deducted in **kobo** (1/100 of NGN)
- Balance validation occurs before transaction processing
- Insufficient balance returns `400` error

### New Balance Return
- Every endpoint returns `newBalance` after successful transaction
- Format: Naira (divide by 100)
- Example: `"newBalance": 45000` = ₦450.00

## Error Handling

### Common Error Responses

**Missing Required Fields**:
```json
{
  "error": "Missing required fields: providerId, accountNumber, amount"
}
```

**Insufficient Balance**:
```json
{
  "error": "Insufficient balance",
  "balance": 3000,
  "required": 5000
}
```

**User Not Found**:
```json
{
  "error": "User not found"
}
```

**Payment Processing Failed**:
```json
{
  "error": "Bill payment failed: [error message]",
  "status": "Failed"
}
```

**Unsupported Network**:
```json
{
  "error": "Network not supported",
  "supportedNetworks": ["MTN", "GLO", "AIRTEL", "9MOBILE"]
}
```

**Invalid Category**:
```json
{
  "error": "Category not found",
  "supportedCategories": ["electricity", "water", "internet", "cable"]
}
```

## Implementation Details

### Service Layer
**File**: `src/services/onepipe.js`

**New Functions**:
- `payBill(providerId, accountNumber, amount, metadata)` - Process bill payment
- `buyAirtime(networkCode, phoneNumber, amount, metadata)` - Purchase airtime
- `buyDataBundle(networkCode, phoneNumber, dataPlanId, amount, metadata)` - Purchase data
- `getDataPlans(networkCode)` - Retrieve available data plans
- `getBillProviders()` - Retrieve available bill providers

### Controller Layer
**File**: `src/controllers/paymentsController.js`

**New Endpoints**:
- `payBillEndpoint()` - REST handler for bill payments
- `buyAirtimeEndpoint()` - REST handler for airtime purchases
- `buyDataBundleEndpoint()` - REST handler for data purchases
- `getDataPlansEndpoint()` - REST handler for data plan retrieval
- `getBillProvidersEndpoint()` - REST handler for bill provider retrieval

### Routing
**File**: `src/routes/payments.js`

**New Routes**:
```javascript
// Bill Payments
POST   /api/payments/bill/pay
GET    /api/payments/bill/providers

// Airtime
POST   /api/payments/airtime/buy

// Data
POST   /api/payments/data/buy
GET    /api/payments/data/plans
```

## Security Considerations

1. **Wallet Balance Validation**: Checked before processing
2. **User Authentication**: All endpoints require valid JWT token
3. **Amount Validation**: Amounts validated and converted to kobo
4. **OnePipe Encryption**: All card and account data encrypted via TripleDES
5. **Transaction Logging**: All transactions logged to database
6. **Commission Tracking**: All commissions recorded for audit

## Testing

### Test Bill Payment
```bash
curl -X POST https://api.wavvapay.io/api/payments/bill/pay \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "NE1001",
    "accountNumber": "12345678",
    "amount": 5000
  }'
```

### Test Airtime Purchase
```bash
curl -X POST https://api.wavvapay.io/api/payments/airtime/buy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "networkCode": "MTN",
    "phoneNumber": "08012345678",
    "amount": 500
  }'
```

### Test Data Purchase
```bash
curl -X POST https://api.wavvapay.io/api/payments/data/buy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "networkCode": "MTN",
    "phoneNumber": "08012345678",
    "dataPlanId": "5GB",
    "amount": 5000
  }'
```

### Get Data Plans
```bash
curl https://api.wavvapay.io/api/payments/data/plans?networkCode=MTN \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Future Enhancements

1. **Subscription Management**: Auto-renew data bundles
2. **Provider Expansion**: Add more utility providers
3. **Bulk Payments**: Batch processing for multiple recipients
4. **Payment Scheduling**: Schedule bill payments for future dates
5. **Discount Coupons**: Apply promo codes to purchases
6. **Payment Analytics**: Dashboard for bill payment trends
7. **Mobile App Integration**: Deep linking to payment screens
8. **Speed Dial**: Save favorite providers for quick access

## Support

For support or integration questions:
- Email: support@wavvapay.io
- Phone: +234 (0) XXX-XXXX-XXXX
- Documentation: https://docs.wavvapay.io/payments
