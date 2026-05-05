# Merchant Features - Quick Reference Guide

## 🚀 Getting Started

### 1. Merchant Registration
```bash
curl -X POST http://localhost:3000/api/merchant/register \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Tech Store",
    "businessType": "sme",
    "phone": "+234xxxxxxxxxx",
    "website": "https://techstore.com",
    "description": "Electronics retail store"
  }'

Response: {
  "merchant": { _id, businessName, status: "pending", ... },
  "wallet": { balance: 0, pendingBalance: 0, ... },
  "message": "Merchant registered successfully. Please complete KYC verification."
}
```

### 2. Get Merchant Profile
```bash
curl -X GET http://localhost:3000/api/merchant/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

Response: {
  "merchant": { _id, businessName, businessType, phone, ... },
  "wallet": { 
    balance: 9500.50,        # Available to withdraw
    pendingBalance: 1200.00,  # Awaiting settlement
    settledBalance: 45000.00  # Already paid out
  },
  "stats": {
    "totalRevenue": 55700.50,
    "totalTransactions": 234,
    "totalCustomers": 156,
    "avgTransactionValue": 238.03
  },
  "limits": {
    "daily": { used: 25000, limit: 50000 },
    "monthly": { used: 150000, limit: 500000 }
  }
}
```

---

## 💳 Payment Links (QR Code Payments)

### Create Payment Link
```bash
curl -X POST http://localhost:3000/api/merchant/payment-links \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "iPhone 15 Pro",
    "description": "Latest iPhone model",
    "amount": 450000,        # In naira (or your currency)
    "currency": "NGN",
    "slug": "iphone-15-pro",
    "allowCustomAmount": false,
    "paymentMethods": ["card", "bank_transfer", "wallet"],
    "metadata": {
      "productId": "12345",
      "category": "electronics"
    }
  }'

Response: {
  "paymentLink": {
    "_id": "...",
    "paymentLinkId": "pl_xxx",
    "merchantId": "...",
    "title": "iPhone 15 Pro",
    "amount": 450000,
    "slug": "iphone-15-pro",
    "qrCode": "data:image/png;base64,...",  # QR Code as Data URL
    "publicUrl": "https://app.com/pay/iphone-15-pro",
    "shareUrl": {
      "whatsapp": "https://wa.me/...",
      "email": "mailto:...",
      "facebook": "https://facebook.com/..."
    },
    "views": 0,
    "initiateCount": 0,
    "completedCount": 0,
    "totalValue": 0
  },
  "message": "Payment link created successfully"
}
```

### List Payment Links
```bash
curl -X GET "http://localhost:3000/api/merchant/payment-links?page=1&limit=20&status=active" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

Response: {
  "paymentLinks": [
    {
      "_id": "...",
      "title": "iPhone 15 Pro",
      "slug": "iphone-15-pro",
      "amount": 450000,
      "views": 45,
      "initiateCount": 12,
      "completedCount": 8,
      "failedCount": 2,
      "totalValue": 3600000,
      "status": "active",
      "createdAt": "2026-02-27T10:30:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 125 }
}
```

### Get Payment Link Analytics
```bash
curl -X GET http://localhost:3000/api/merchant/payment-links/LINK_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

Response: {
  "paymentLink": { ... },
  "analytics": {
    "totalViews": 45,
    "initiateCount": 12,
    "completedPayments": 8,
    "failedPayments": 2,
    "totalRevenue": 3600000,
    "avgTransactionValue": 450000,
    "conversionRate": "17.78%",  # (8/45)*100
    "recentTransactions": [
      {
        "amount": 450000,
        "commission": 6750,
        "netAmount": 443250,
        "status": "completed",
        "paymentMethod": "card",
        "customerEmail": "customer@example.com",
        "completedAt": "2026-02-27T10:30:00Z"
      }
    ]
  }
}
```

---

## 📊 Merchant Dashboard

### Dashboard Summary
```bash
curl -X GET http://localhost:3000/api/merchant/dashboard/summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

Response: {
  "wallet": {
    "available": 9500.50,
    "pending": 1200.00,
    "settled": 45000.00
  },
  "today": {
    "revenue": 125000,
    "transactionCount": 5,
    "avgTransactionValue": 25000
  },
  "thisMonth": {
    "revenue": 2150000,
    "transactionCount": 92,
    "avgTransactionValue": 23370.65
  },
  "pendingSettlement": {
    "amount": 1200.00,
    "date": "2026-02-28T09:00:00Z",
    "status": "initiated"
  },
  "merchantStats": {
    "totalRevenue": 55700.50,
    "totalTransactions": 234,
    "totalCustomers": 156
  }
}
```

### Sales Analytics
```bash
curl -X GET "http://localhost:3000/api/merchant/dashboard/analytics?period=month" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

Response: {
  "timeline": [
    {
      "date": "2026-02-01",
      "revenue": 125000,
      "transactionCount": 5,
      "commission": 1875,
      "byPaymentMethod": {
        "card": { revenue: 75000, count: 3 },
        "bank_transfer": { revenue: 50000, count: 2 }
      }
    },
    {
      "date": "2026-02-02",
      "revenue": 85000,
      "transactionCount": 3,
      "commission": 1275,
      "byPaymentMethod": {
        "card": { revenue: 85000, count: 3 }
      }
    }
  ],
  "totals": {
    "totalRevenue": 2150000,
    "totalTransactions": 92,
    "totalCommission": 32250
  },
  "byPaymentMethod": {
    "card": { revenue: 1350000, count: 55 },
    "bank_transfer": { revenue: 800000, count: 37 }
  }
}
```

### Top Performing Payment Links
```bash
curl -X GET "http://localhost:3000/api/merchant/dashboard/top-links?limit=5" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

Response: {
  "topLinks": [
    {
      "title": "iPhone 15 Pro",
      "slug": "iphone-15-pro",
      "completedCount": 45,
      "failedCount": 2,
      "totalValue": 20250000,
      "views": 250,
      "conversionRate": 18.0
    },
    {
      "title": "MacBook Pro",
      "slug": "macbook-pro",
      "completedCount": 32,
      "failedCount": 1,
      "totalValue": 16000000,
      "views": 180,
      "conversionRate": 17.77
    }
  ]
}
```

### Transaction History
```bash
curl -X GET "http://localhost:3000/api/merchant/dashboard/transactions?page=1&limit=20&status=completed" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

Response: {
  "transactions": [
    {
      "_id": "...",
      "amount": 450000,
      "currency": "NGN",
      "commission": 6750,
      "platformFee": 4500,
      "netAmount": 438750,
      "status": "completed",
      "paymentMethod": "card",
      "customerName": "John Doe",
      "customerEmail": "john@example.com",
      "customerPhone": "+234xxxxxxxxxx",
      "paymentLinkId": "...",
      "metadata": { "productId": "12345" },
      "completedAt": "2026-02-27T10:30:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 234 }
}
```

---

## 💰 Settlement & Payouts

### Request Settlement (Manual Payout)
```bash
curl -X POST http://localhost:3000/api/merchant/settlement/request \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50000  # In naira (or your currency)
  }'

Response: {
  "settlement": {
    "_id": "...",
    "merchantId": "...",
    "amount": 50000,
    "commission": 750,
    "platformFee": 500,
    "totalFee": 1250,
    "netAmount": 48750,
    "status": "initiated",
    "reference": "SETTLE_MERCHANT123_1708346400",
    "bankAccount": {
      "accountName": "JOHN'S STORE",
      "accountNumber": "123456789",
      "bankCode": "033",
      "bankName": "United Bank"
    },
    "scheduledDate": "2026-02-28T09:00:00Z",
    "message": "Settlement request successful. You will receive ₦48,750 on 2026-02-28"
  }
}
```

### Get Settlement History
```bash
curl -X GET "http://localhost:3000/api/merchant/settlement/history?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

Response: {
  "settlements": [
    {
      "_id": "...",
      "amount": 50000,
      "netAmount": 48750,
      "status": "completed",
      "reference": "SETTLE_MERCHANT123_1708346400",
      "bankAccount": { ... },
      "scheduledDate": "2026-02-28T09:00:00Z",
      "completedDate": "2026-02-28T10:30:00Z"
    },
    {
      "_id": "...",
      "amount": 75000,
      "netAmount": 73250,
      "status": "failed",
      "reference": "SETTLE_MERCHANT123_1708260000",
      "failureReason": "Invalid account number",
      "retryCount": 1,
      "nextRetryDate": "2026-03-01T09:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 12 }
}
```

### Get Pending Settlement
```bash
curl -X GET http://localhost:3000/api/merchant/settlement/pending \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

Response: {
  "settlement": {
    "_id": "...",
    "amount": 50000,
    "status": "initiated",
    "reference": "SETTLE_MERCHANT123_1708346400",
    "scheduledDate": "2026-02-28T09:00:00Z"
  }
  // or null if no pending settlement
}
```

### Cancel Settlement
```bash
curl -X POST "http://localhost:3000/api/merchant/settlement/SETTLEMENT_ID/cancel" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

Response: {
  "settlement": {
    "_id": "...",
    "status": "cancelled",
    "message": "Settlement cancelled. ₦50,000 refunded to available balance."
  }
}
```

---

## 🔑 API Keys (For Developers)

### Generate API Key
```bash
curl -X POST http://localhost:3000/api/merchant/api-keys/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mobile App"
  }'

Response: {
  "apiKey": {
    "_id": "...",
    "name": "Mobile App",
    "key": "sk_live_abc123xyz789_1708346400",  # ⚠️ SAVE THIS - Only shown once!
    "preview": "sk_live_abc***",
    "createdAt": "2026-02-27T10:30:00Z"
  },
  "message": "API Key created. Save it securely - you won't see it again!"
}
```

### List API Keys
```bash
curl -X GET http://localhost:3000/api/merchant/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

Response: {
  "apiKeys": [
    {
      "_id": "...",
      "name": "Mobile App",
      "preview": "sk_live_abc***",
      "active": true,
      "createdAt": "2026-02-27T10:30:00Z",
      "lastUsedAt": "2026-02-27T15:45:00Z"
    }
  ]
}
```

---

## ⚙️ Settings

### Update Settlement Settings
```bash
curl -X PUT http://localhost:3000/api/merchant/settings/settlement \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "autoSettlement": true,
    "settlementFrequency": "daily",  # "daily", "weekly", "monthly"
    "settlementDay": 1,              # For weekly/monthly (1-7 or 1-31)
    "commissionRate": 1.5            # Percentage
  }'

Response: {
  "merchant": {
    "settings": {
      "autoSettlement": true,
      "settlementFrequency": "daily",
      "settlementDay": 1,
      "commissionRate": 1.5
    }
  },
  "message": "Settlement settings updated"
}
```

### Add Bank Account
```bash
curl -X POST http://localhost:3000/api/merchant/bank-account \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountNumber": "123456789",
    "bankCode": "033",  # Bank code from your bank list
    "accountName": "JOHN'S STORE",
    "bankName": "United Bank"
  }'

Response: {
  "merchant": {
    "bankAccount": {
      "accountNumber": "1234***89",  # Partially masked
      "bankCode": "033",
      "accountName": "JOHN'S STORE",
      "bankName": "United Bank",
      "verified": false  # Requires admin verification
    }
  },
  "message": "Bank account added. It will be verified shortly by our team."
}
```

---

## 📱 How Customers Pay (Payment Link)

### Customer Scans QR Code or Opens Link
1. **Scan QR from payment link** OR **Click shared link**
   ```
   https://yourapp.com/pay/iphone-15-pro
   ```

2. **Payment form displays:**
   - Product title: "iPhone 15 Pro"
   - Amount: ₦450,000
   - Select payment method: Card / Bank / Wallet
   - Contact info for receipt

3. **Customer enters payment details and pays**
   - System processes payment
   - Creates `MerchantTransaction` record
   - Automatically deducts commission
   - Credits merchant wallet

4. **Confirmation sent to merchant**
   - Dashboard updates
   - Analytics updated
   - Optional: Webhook notification

---

## Commission & Fees

### How It Works
```
Transaction Flow:
1. Customer pays:              ₦450,000
2. Commission deducted:        -₦6,750 (1.5%)
3. Net to merchant:            ₦443,250 (goes to wallet)

Settlement Flow (Requesting Payout):
1. Available balance:          ₦443,250
2. Platform fee (1%):          -₦4,432.50
3. Net payout:                 ₦438,817.50 ✅ To bank account
```

### Commission Rates by Merchant Tier
- **Basic**: 1.5%
- **Premium**: 1.0%
- **Enterprise**: Custom negotiated rate

---

## Data Flow Summary

```
Customer Pays via Payment Link
    ↓
MerchantTransaction created
Commission auto-deducted
    ↓
Funds credited to MerchantWallet
(balance = netAmount)
    ↓
Merchant requests Settlement
    ↓
Funds move: balance → pendingBalance
        ↓
Settlement processed (T+1)
    ↓
Funds paid to Bank Account
MerchantWallet.settledBalance updated
    ↓
✅ Settlement.status = "completed"
```

---

## Status Codes

### Transaction Statuses
- `pending` - Payment processing
- `completed` - Payment received ✅
- `failed` - Payment failed ❌
- `refunded` - Payment refunded

### Settlement Statuses
- `scheduled` - Waiting to process
- `initiated` - Processing started
- `processing` - In transit
- `completed` - Paid to bank ✅
- `failed` - Payment failed ❌
- `cancelled` - User cancelled

### Merchant Statuses
- `pending` - Awaiting KYC verification
- `active` - KYC approved, can accept payments
- `suspended` - Temporarily blocked
- `rejected` - KYC rejected

---

## Error Responses

### 400 - Bad Request
```json
{ "error": "Validation failed", "details": "Amount must be positive" }
```

### 401 - Unauthorized
```json
{ "error": "Authentication failed", "message": "Invalid or expired token" }
```

### 403 - Forbidden
```json
{ "error": "Forbidden", "message": "Only merchant owner can access this" }
```

### 404 - Not Found
```json
{ "error": "Not found", "message": "Payment link not found" }
```

### 409 - Conflict
```json
{ "error": "Conflict", "message": "Payment link slug already exists" }
```

---

## Testing Checklist

- [ ] Create merchant account
- [ ] Add bank account
- [ ] Create payment link
- [ ] Verify QR code generates
- [ ] Check payment link appears in list
- [ ] Verify analytics counter works
- [ ] Request manual settlement
- [ ] Check settlement in history
- [ ] Verify wallet balance updated
- [ ] View merchant dashboard summary
- [ ] View sales analytics chart data
- [ ] Get top performing links

---

## Notes

- All amounts are in **cents** (e.g., 450000 = ₦4,500)
- Commission deducted immediately on transaction
- Settlement fee (1%) charged on payout request
- QR codes are Data URLs (base64 images)
- All timestamps are ISO 8601 format
- Pagination: Default 20 items per page
- Auth required: All endpoints need JWT token

