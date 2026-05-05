# Merchant Features Implementation Analysis

## Current Status: ❌ NO MERCHANT FEATURES IMPLEMENTED

The backend is currently designed as a **Consumer/P2P Payment System**. There are **NO merchant-specific features** for business payments and collections.

---

## What's Currently Implemented (Consumer-Focused)

### ✅ Core Consumer Features
1. **P2P Transfers** - Send money between users
   - Via Username/QR/NFC
   - With fee calculation
   
2. **Wallet Management** - Multiple wallets by purpose
   - General, Savings, Bills, Spending, Investment, Emergency
   - Multi-currency (USD, NGN)
   
3. **Payment Requests** - Minimal implementation
   - Send/receive payment requests
   - No persistent storage
   
4. **QR Code Payment** - Basic token generation only
   - Generates tokens (not actual QR images)
   - No merchant payment links
   
5. **Wallet Funding** - Via Paystack
   - One-way top-up, not for merchant collections
   
6. **Bank Transfers** - User payouts only
   - Not for merchant settlement

---

## Missing Merchant Features

### 1) ❌ Payment Acceptance (Merchant Collections)

**What Needs to Be Built:**

```javascript
// Models Needed
- MerchantPaymentLink
- PaymentPage 
- MerchantQRCode
- PaymentReference

// Controllers
- merchantPaymentController
- merchantQRController
- paymentLinkController

// Routes
- /merchant/payment-links
- /merchant/qr-codes
- /merchant/payment-page/:linkId
```

**Features to Add:**
- Static QR codes for shops (tied to merchant account)
- Dynamic QR codes for specific amounts
- Payment links (WhatsApp, email, social media shareable)
- Public payment page
- Accept payments WITHOUT customer needing account

---

### 2) ❌ Merchant Dashboard & Analytics

**Missing Components:**
- Real-time transaction history
- Daily/weekly/monthly sales summary
- Customer payment logs
- Revenue analytics & charts
- Export to CSV/PDF
- Funnel analytics
- Revenue by payment method

**Models Needed:**
```javascript
const merchantDashboardSchema = {
  merchantId: ObjectId,
  totalRevenue: Number,
  totalTransactions: Number,
  avgTransactionValue: Number,
  topPaymentMethods: [],
  revenueByDate: [],
  conversionRate: Number,
  lastUpdated: Date
}
```

---

### 3) ❌ Settlement & Payout System

**Missing:**
- Merchant wallet balance (separate from personal)
- Automatic settlement (T+0 / T+1)
- Manual withdrawal option
- Settlement history
- Commission deduction before payout
- Settlement schedule settings
- Bank account management for settlements

**Models Needed:**
```javascript
const merchantWalletSchema = {
  merchantId: ObjectId,
  balance: Number,
  pendingBalance: Number,  // Awaiting settlement
  settledBalance: Number,
  settlements: [{ // History
    amount: Number,
    date: Date,
    bank: String,
    status: 'completed' | 'pending' | 'failed'
  }],
  autoSettlementEnabled: Boolean,
  settlementFrequency: 'daily' | 'weekly' | 'monthly'
}

const settlementSchema = {
  merchantId: ObjectId,
  amount: Number,
  commission: Number,
  netAmount: Number,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  scheduledDate: Date,
  completedDate: Date,
  bankAccount: Object,
  reference: String
}
```

---

### 4) ❌ Invoicing System

**Missing:**
- Invoice generation
- Recurring invoices (subscriptions)
- Invoice reminders
- Due date tracking
- Invoice status (draft, sent, paid, overdue)
- PDF generation
- Email delivery

**Models Needed:**
```javascript
const invoiceSchema = {
  merchantId: ObjectId,
  customerId: ObjectId,
  invoiceNumber: String,
  items: [{
    description: String,
    quantity: Number,
    unitPrice: Number,
    amount: Number
  }],
  subtotal: Number,
  tax: Number,
  total: Number,
  dueDate: Date,
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled',
  paymentLink: String,
  createdAt: Date,
  sentAt: Date,
  paidAt: Date,
  notes: String
}
```

---

### 5) ❌ Customer Management (Mini CRM)

**Missing:**
- Customer database per merchant
- Payment history per customer
- Customer lifetime value
- Send payment reminders
- Bulk SMS/email notifications
- Customer segmentation

**Models Needed:**
```javascript
const merchantCustomerSchema = {
  merchantId: ObjectId,
  name: String,
  email: String,
  phone: String,
  totalPaid: Number,
  paymentCount: Number,
  lastPaymentDate: Date,
  tags: [String],
  notes: String,
  addresses: [{
    type: String,
    street: String,
    city: String,
    state: String,
    zip: String
  }],
  customFields: Map
}
```

---

### 6) ❌ Subscription & Recurring Payments

**Missing:**
- Subscription plans
- Billing cycles
- Auto-debit customers
- Failed payment retry
- Subscription management
- Revenue recognition

**Models Needed:**
```javascript
const subscriptionPlanSchema = {
  merchantId: ObjectId,
  name: String,
  description: String,
  amount: Number,
  billingCycle: 'daily' | 'weekly' | 'monthly' | 'yearly',
  trialPeriodDays: Number,
  maxBillings: Number, // null = infinite
  status: 'active' | 'inactive',
  createdAt: Date
}

const subscriptionSchema = {
  customerId: ObjectId,
  planId: ObjectId,
  merchantId: ObjectId,
  nextBillingDate: Date,
  status: 'active' | 'paused' | 'cancelled' | 'expired',
  billingHistory: [{
    amount: Number,
    date: Date,
    status: 'success' | 'failed'
  }]
}
```

---

### 7) ❌ Merchant Storefront (Mini Online Store)

**Missing:**
- Product catalog
- Inventory management
- Order management
- Shopping cart
- Public store page
- Order history

**Models Needed:**
```javascript
const merchantProductSchema = {
  merchantId: ObjectId,
  name: String,
  description: String,
  price: Number,
  image: String,
  inventory: Number,
  sku: String,
  category: String,
  taxable: Boolean,
  active: Boolean
}

const orderSchema = {
  customerId: ObjectId,
  merchantId: ObjectId,
  items: [{
    productId: ObjectId,
    quantity: Number,
    price: Number
  }],
  subtotal: Number,
  tax: Number,
  total: Number,
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled',
  shippingAddress: Object,
  trackingNumber: String
}
```

---

### 8) ❌ API & Developer Tools

**Missing:**
- Merchant API keys
- Webhook endpoints
- Payment API endpoints
- Transaction verification endpoints
- SDK documentation

**Models Needed:**
```javascript
const apiKeySchema = {
  merchantId: ObjectId,
  keyName: String,
  publicKey: String,
  secretKey: String,
  permissions: [String],
  lastUsedAt: Date,
  createdAt: Date,
  revokedAt: Date
}

const webhookSchema = {
  merchantId: ObjectId,
  url: String,
  events: [String], // 'payment.received', 'payment.failed', etc.
  active: Boolean,
  secret: String,
  retryAttempts: Number,
  lastTriggered: Date
}
```

---

### 9) ❌ Merchant Security & Compliance

**Missing:**
- Business KYC (separate from user KYC)
- Document upload for verification
- Role-based access (Owner, Staff, Accountant)
- 2FA for merchant accounts
- Fraud monitoring
- Transaction limits
- Dispute handling

**Models Needed:**
```javascript
const merchantKYCSchema = {
  merchantId: ObjectId,
  businessName: String,
  businessType: String,
  registration: {
    number: String,
    document: String,
    verified: Boolean
  },
  directors: [{
    name: String,
    idDocument: String,
    verified: Boolean
  }],
  bankAccount: {
    accountNumber: String,
    bankCode: String,
    accountName: String,
    verified: Boolean
  },
  status: 'pending' | 'approved' | 'rejected',
  kycLevel: 1 | 2 | 3,
  limits: {
    dailyTransaction: Number,
    monthlyTransaction: Number
  }
}

const merchantStaffSchema = {
  merchantId: ObjectId,
  userId: ObjectId,
  role: 'owner' | 'manager' | 'staff' | 'accountant',
  permissions: [String],
  addedAt: Date
}
```

---

### 10) ❌ POS & Offline Features

**Missing:**
- POS terminal support
- Card reader integration
- Offline transaction queuing
- Staff accounts with separate tracking
- Receipt printing
- Cash management

**Models Needed:**
```javascript
const posTerminalSchema = {
  merchantId: ObjectId,
  terminalId: String,
  name: String,
  location: String,
  status: 'online' | 'offline',
  lastSyncedAt: Date
}

const posTransactionSchema = {
  terminalId: ObjectId,
  amount: Number,
  paymentMethod: String,
  receiptNumber: String,
  staffId: ObjectId,
  timestamp: Date,
  synced: Boolean
}
```

---

## Recommended MVP Merchant Features (Phase 1)

Start with these to create a solid foundation:

### Phase 1 (Minimum Viable Product)
1. ✅ **Merchant Registration** - Separate merchant account type
2. ✅ **Business KYC** - Document upload and verification
3. ✅ **Merchant Wallet** - Separate from personal wallet
4. ✅ **Payment Links** - Generate shareable links
5. ✅ **QR Codes** - Static QR for shops
6. ✅ **Transaction Dashboard** - Real-time history + basic analytics
7. ✅ **Settlement** - Manual withdrawal + auto-settlement T+1
8. ✅ **Commission Deduction** - Automatic before payout

### Phase 2 (Enhanced)
9. **Customer Management** - CRM lite
10. **Invoicing** - Basic invoice generation
11. **Recurring Payments** - Subscriptions
12. **CSV Export** - Download transaction history

### Phase 3 (Advanced)
13. **API Keys** - Merchant API access
14. **Staff Accounts** - Multiple users per merchant
15. **POS Integration** - Payment terminals
16. **Disputes** - Chargeback handling

---

## Database Model Structure

### New Collections Needed for MVP

```javascript
// 1. Merchant Account
{
  _id: ObjectId,
  userId: ObjectId,  // Link to User account
  businessName: String,
  businessType: String,
  phone: String,
  website: String,
  logo: String,
  description: String,
  status: 'pending' | 'active' | 'suspended',
  tier: 'basic' | 'pro' | 'enterprise',
  kyc: {
    verified: Boolean,
    level: 1 | 2 | 3,
    documents: [{}]
  },
  settings: {
    autoSettlement: Boolean,
    settlementDay: Number,
    notificationEmail: String,
    webhook: String
  },
  createdAt: Date
}

// 2. Payment Link
{
  _id: ObjectId,
  merchantId: ObjectId,
  title: String,
  description: String,
  amount: Number,
  currency: String,
  slug: String,
  customURL: String,
  qrCode: String,
  status: 'active' | 'inactive',
  views: Number,
  conversions: Number,
  createdAt: Date
}

// 3. Merchant Transaction (different from P2P)
{
  _id: ObjectId,
  merchantId: ObjectId,
  customerId: ObjectId,  // null if not logged in
  paymentLinkId: ObjectId,
  amount: Number,
  currency: String,
  status: 'completed' | 'failed' | 'pending',
  paymentMethod: 'qr' | 'link' | 'api',
  commission: Number,
  netAmount: Number,
  reference: String,
  createdAt: Date
}

// 4. Merchant Wallet
{
  _id: ObjectId,
  merchantId: ObjectId,
  balance: Number,
  pendingBalance: Number,
  settledBalance: Number,
  currency: String,
  bankAccount: {
    accountNumber: String,
    bankCode: String,
    accountName: String,
    verified: Boolean
  },
  createdAt: Date
}

// 5. Settlement Record
{
  _id: ObjectId,
  merchantId: ObjectId,
  amount: Number,
  commission: Number,
  netAmount: Number,
  status: 'scheduled' | 'processing' | 'completed' | 'failed',
  scheduledDate: Date,
  completedDate: Date,
  transactions: [ObjectId],  // linked transactions
  reference: String
}
```

---

## Files to Create for MVP

### Models
- `Merchant.js` - Merchant account
- `PaymentLink.js` - Payment link
- `MerchantTransaction.js` - Merchant payments
- `MerchantWallet.js` - Merchant balance
- `Settlement.js` - Settlement records
- `MerchantKYC.js` - Business verification

### Controllers
- `merchantController.js` - Registration, profile
- `paymentLinkController.js` - Create/manage links
- `merchantPaymentController.js` - Receive payments
- `settlementController.js` - Payouts
- `merchantDashboardController.js` - Analytics

### Routes
- `merchant.js` - Merchant management
- `merchantPayments.js` - Payment acceptance
- `merchantDashboard.js` - Analytics
- `settlement.js` - Payouts

### Services
- `merchantKYC.js` - KYC verification
- `settlementService.js` - Settlement logic
- `qrGenerator.js` - QR code generation

---

## Summary: What's Missing

| Feature | Status | Priority |
|---------|--------|----------|
| Merchant Registration | ❌ | MVP1 |
| Business KYC | ❌ | MVP1 |
| Payment Links | ❌ | MVP1 |
| QR Codes (Static) | ❌ | MVP1 |
| Merchant Wallet | ❌ | MVP1 |
| Settlement System | ❌ | MVP1 |
| Commission Deduction | ❌ | MVP1 |
| Dashboard & Analytics | ❌ | MVP1 |
| **Customer Management** | ❌ | MVP2 |
| **Invoicing** | ❌ | MVP2 |
| **Subscriptions** | ❌ | MVP2 |
| Storefront | ❌ | Phase 3 |
| API Access | ❌ | Phase 3 |
| POS Integration | ❌ | Phase 3 |
| Staff Accounts | ❌ | Phase 3 |

---

## Next Steps

Would you like me to:
1. **Create Merchant MVP models** (Merchant, PaymentLink, MerchantWallet, Settlement)
2. **Build merchant payment acceptance** (Payment links + QR codes)
3. **Create settlement system** (Automatic payouts with commission)
4. **Build merchant dashboard** (Basic analytics + transaction history)
5. **Implement merchant KYC** (Business verification)

Let me know which feature you'd like to prioritize! 🚀
