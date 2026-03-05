# Merchant Features - Next Phase Roadmap

## 🎯 Phase 2: Completing the Merchant Platform

Your MVP merchant system is now **50% complete**. Below are the features needed to make it fully functional.

---

## 🔴 CRITICAL (Must have for customers to pay)

### 1. **Customer Payment Checkout** 
**Status**: ❌ NOT YET IMPLEMENTED  
**Priority**: 🔴 CRITICAL - Required for revenue

#### What's Needed
- Public endpoint to process payment on payment link
- No auth required (customers shouldn't need account)
- Integrate with Paystack to charge card/wallet
- Create MerchantTransaction record

#### Implementation Details
```javascript
// src/routes/paymentLink.js - ADD THIS:
router.post('/:linkId/checkout', async (req, res) => {
  // 1. Get payment link (linkId)
  // 2. Validate amount (fixed or custom)
  // 3. Validate payment method
  // 4. Call Paystack.initializePayment()
  // 5. Create MerchantTransaction with status="pending"
  // 6. Return Paystack authorization URL or charge response
  // 7. On webhook: Update transaction status to "completed"
  // 8. Add net amount to merchant wallet
  // 9. Increment payment link completed count
})
```

#### Endpoint
```bash
POST /api/merchant/payment-links/:linkId/checkout
Body: {
  amount: 450000,           # Only if allowCustomAmount=true
  paymentMethod: "card",    # "card", "bank", "wallet"
  email: "customer@example.com",
  phone: "+234xxxxxxxxxx",
  name: "John Doe",
  cardDetails: { ... }      # If payment method is card
}
```

#### Expected Response
```json
{
  "authorizationUrl": "https://checkout.paystack.com/...",
  "accessCode": "...",
  "reference": "merchant_trans_12345"
}
```

---

### 2. **Payment Link Public Viewing**
**Status**: ❌ NOT YET IMPLEMENTED  
**Priority**: 🔴 CRITICAL - Required for sharing

#### What's Needed
- Public endpoint to view payment link (no auth)
- Increment views counter
- Return payment form data

#### Implementation Details
```javascript
// src/routes/paymentLink.js - ADD THIS:
router.get('/public/:slug', async (req, res) => {
  // 1. Find payment link by slug
  // 2. Increment views counter
  // 3. Return: title, description, amount, qrCode, paymentMethods
  // 4. No auth required
})
```

#### Endpoint
```bash
GET /api/merchant/payment-links/public/iphone-15-pro
```

#### Expected Response
```json
{
  "paymentLink": {
    "title": "iPhone 15 Pro",
    "description": "Latest model",
    "amount": 450000,
    "slug": "iphone-15-pro",
    "allowCustomAmount": false,
    "paymentMethods": ["card", "bank_transfer"],
    "merchantName": "Tech Store",
    "merchantLogo": "https://...",
    "qrCode": "data:image/png;base64,..."
  }
}
```

---

## 🟠 HIGH (Needed for merchant to verify identity)

### 3. **KYC Approval Workflow**
**Status**: ❌ NOT YET IMPLEMENTED  
**Priority**: 🟠 HIGH - Blocks merchant from accepting payments

#### What's Needed
- Admin endpoint to approve/reject KYC
- Verify merchant can only accept payments after approval

#### Implementation Details
```javascript
// src/controllers/adminController.js - ADD THIS:
exports.approveMerchantKYC = async (req, res) => {
  // 1. Get KYC record by ID
  // 2. Validate admin auth
  // 3. Update KYC.status = "approved"
  // 4. Update Merchant.kycVerified = true
  // 5. Send notification to merchant
}

exports.rejectMerchantKYC = async (req, res) => {
  // 1. Get KYC record by ID
  // 2. Update KYC.status = "rejected"
  // 3. Save rejection reason
  // 4. Send notification asking for re-submission
}
```

#### Admin Endpoints
```bash
POST /api/admin/kyc/:kycId/approve
Body: { comment: "Verified" }

POST /api/admin/kyc/:kycId/reject
Body: { rejectionReason: "Invalid document" }
```

#### Gate to Implement
```javascript
// In paymentLinkController.createPaymentLink():
if (!merchant.kycVerified) {
  return res.status(403).json({ 
    error: "KYC verification required before creating payment links" 
  });
}
```

---

### 4. **KYC Document Upload**
**Status**: ❌ NOT YET IMPLEMENTED  
**Priority**: 🟠 HIGH - Required for merchant verification

#### What's Needed
- Endpoint to upload business registration document
- Endpoint to upload director/owner ID
- Endpoint to upload bank statement
- Store document URLs in MerchantKYC

#### Implementation Details
```javascript
// src/routes/merchant.js - ADD THIS:
router.post('/kyc/upload-business-registration', upload.single('document'), 
  async (req, res) => {
    // 1. Upload to Cloudinary
    // 2. Save URL to KYC.businessRegistration.document
    // 3. Return success
  });

router.post('/kyc/upload-director-id', upload.single('document'), 
  async (req, res) => {
    // 1. Upload director ID
    // 2. Save to KYC.directors[index].idDocument
    // 3. Return success
  });

router.post('/kyc/upload-bank-statement', upload.single('document'), 
  async (req, res) => {
    // 1. Upload bank statement
    // 2. Save to KYC.bankAccount.verificationDocument
    // 3. Return success
  });
```

---

## 🟡 MEDIUM (Nice to have for production)

### 5. **Settlement Automation (Cron Job)**
**Status**: ❌ NOT YET IMPLEMENTED  
**Priority**: 🟡 MEDIUM - Manual settlement works, but not scalable

#### What's Needed
- Cron job to execute scheduled settlements
- Set to run daily at 9 AM
- Process all settlements with `status="scheduled"`

#### Implementation Details
```javascript
// src/services/settlementCron.js - CREATE THIS:
const cron = require('node-cron');

// Run every day at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  try {
    // 1. Find all settlements with status="scheduled"
    // 2. For each settlement:
    //    a. Call Paystack.createTransfer()
    //    b. Update settlement.status = "processing"
    //    c. Save paymentGatewayReference
    // 3. On success: status = "completed"
    // 4. On failure: status = "failed", set retryDate = tomorrow
  } catch (error) {
    console.error('Settlement cron failed:', error);
  }
});
```

#### Installation
```bash
npm install node-cron
```

#### Integration in server.js
```javascript
// After all route definitions:
if (process.env.NODE_ENV === 'production') {
  require('./services/settlementCron');
  console.log('✅ Settlement cron job started');
}
```

---

### 6. **Webhooks for Merchant Notifications**
**Status**: ❌ NOT YET IMPLEMENTED  
**Priority**: 🟡 MEDIUM - Optional but improves integration

#### What's Needed
- Endpoint for merchants to register webhook URL
- Send POST to webhook on payment completion
- Send POST to webhook on settlement completion
- Signed payload with merchant secret key

#### Implementation Details
```javascript
// Add to Merchant model:
webhookUrl: String,
webhookSecret: String

// In paymentLinkController.js - after transaction completed:
if (merchant.webhookUrl) {
  const payload = {
    event: "payment.completed",
    merchant_id: merchant._id,
    transaction_id: transaction._id,
    amount: transaction.netAmount,
    customer_email: transaction.customerEmail,
    timestamp: new Date().toISOString()
  };
  
  // Sign with merchant secret
  const signature = crypto
    .createHmac('sha256', merchant.webhookSecret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  // Send POST request
  await axios.post(merchant.webhookUrl, payload, {
    headers: { 'X-Webhook-Signature': signature }
  });
}
```

#### Merchant Webhooks Setup
```bash
PUT /api/merchant/webhook
Body: {
  webhookUrl: "https://yourdomain.com/webhooks/wavva",
}

# System generates webhookSecret automatically
```

---

### 7. **Webhook Verification Test**
**Status**: ❌ NOT YET IMPLEMENTED  
**Priority**: 🟡 MEDIUM - Helps debugging merchant integration

#### What's Needed
- Endpoint to send test webhook
- Merchant can verify webhook setup works

#### Implementation Details
```javascript
// src/routes/merchant.js - ADD THIS:
router.post('/webhook/test', async (req, res) => {
  const merchant = await Merchant.findById(req.userId.merchantId);
  
  const testPayload = {
    event: "test",
    message: "This is a test webhook",
    timestamp: new Date().toISOString()
  };
  
  const signature = crypto
    .createHmac('sha256', merchant.webhookSecret)
    .update(JSON.stringify(testPayload))
    .digest('hex');
  
  try {
    await axios.post(merchant.webhookUrl, testPayload, {
      headers: { 'X-Webhook-Signature': signature }
    });
    res.json({ success: true, message: "Test webhook sent" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

---

## 🟢 NICE TO HAVE (Phase 3+)

### 8. **Invoice Generation**
Generate PDF invoices for customers & merchants

```javascript
// POST /api/merchant/transactions/:transactionId/invoice
// Returns: PDF download
// Contains: customer info, items, amount, merchant details
```

---

### 9. **Recurring Payments / Subscriptions**
Allow customers to set up recurring charges

```javascript
// POST /api/merchant/payment-links/:linkId/subscription
// Body: { frequency: "daily|weekly|monthly", endDate: "..." }
// Charges customer automatically at interval
```

---

### 10. **Refunds & Disputes**
Merchant can request refund for transaction

```javascript
// POST /api/merchant/transactions/:transactionId/refund
// Body: { refundAmount: 450000, reason: "Customer requested" }
// Refund sent to customer, deducted from merchant wallet
```

---

### 11. **Storefront / Mini Shop**
Merchant can showcase products with photos

```javascript
// POST /api/merchant/products
// GET /api/merchant/products
// Generates storefront: yourdomain.com/shop/merchant-slug
```

---

### 12. **Advanced Analytics**
- Export reports (CSV/PDF)
- Profit/loss analysis
- Customer lifetime value
- Churn analysis

```javascript
// GET /api/merchant/dashboard/reports/export
// Query: { format: "csv|pdf", startDate, endDate }
```

---

## 📋 Implementation Checklist

### Phase 2 (Required)
- [ ] Create `/public/:slug` endpoint for public payment link viewing
- [ ] Create `/:linkId/checkout` endpoint for customer payments
- [ ] Integrate Paystack payment processing in checkout
- [ ] Create KYC document upload endpoints
- [ ] Create admin KYC approval/rejection endpoints
- [ ] Add KYC verification gate to payment link creation
- [ ] Create settlement cron job
- [ ] Test settlement automation with Paystack
- [ ] Create webhook registration in merchant settings
- [ ] Implement payment completion webhook notifications

### Phase 3+ (Nice to have)
- [ ] Invoice generation service
- [ ] Subscription/recurring payments
- [ ] Refund workflow
- [ ] Storefront feature
- [ ] Advanced analytics & reports
- [ ] Customer CRM
- [ ] POS integration
- [ ] Mobile app integration
- [ ] White-label support
- [ ] Multi-currency support refinement

---

## 🔧 Quick Implementation Guide

### To Add Customer Checkout:
1. Create new file: `src/routes/paymentLink.js`
2. Add method: `POST /:linkId/checkout`
3. Validate payment method
4. Call Paystack API
5. Create MerchantTransaction
6. Return authorization URL

### To Add KYC Approval:
1. Create: `src/controllers/adminController.js`
2. Add methods: `approveMerchantKYC()`, `rejectMerchantKYC()`
3. Create routes: `src/routes/admin.js`
4. Add auth check: `isAdmin` middleware
5. Test with admin user

### To Add Settlement Cron:
1. `npm install node-cron`
2. Create: `src/services/settlementCron.js`
3. Add schedule: `cron.schedule('0 9 * * *', ...)`
4. Integrate in `server.js`
5. Test with manual settlement trigger

---

## 🚀 Recommended Sequence

**Week 1:**
1. ✅ Customer payment checkout
2. ✅ Public payment link viewing
3. ✅ Settlement cron job

**Week 2:**
4. ✅ KYC document upload
5. ✅ KYC approval workflow
6. ✅ Webhook integration

**Week 3+:**
7. Phase 3 features based on merchant feedback

---

## 📞 Questions to Ask

1. **Payment Methods**: Should we support Flutterwave in addition to Paystack?
2. **Webhooks**: Should we retry failed webhooks?
3. **Settlements**: Daily at 9 AM UTC or merchant-specific timezone?
4. **Refunds**: Who pays refund fee (merchant or platform)?
5. **Storage**: Where to store documents - Cloudinary or own storage?
6. **Currencies**: Support multiple currencies or NGN only?

---

*Roadmap prepared for Phase 2 implementation*  
*Estimated effort: 40-60 hours for complete feature set*
