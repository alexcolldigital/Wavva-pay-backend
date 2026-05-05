# Internal Commission Ledger System

## Overview

The Internal Commission Ledger System is a comprehensive solution for tracking all commissions and fees collected from wallet transactions. All commission amounts are automatically recorded and credited to a dedicated internal ledger wallet managed by the platform.

## Architecture

### Components

1. **CommissionLedger Model** (`src/models/CommissionLedger.js`)
   - Stores all commission/fee transactions
   - Tracks source, amount, currency, and user details
   - Generates unique ledger entry numbers for audit trails

2. **Commission Service** (`src/services/commissionService.js`)
   - Core functionality for recording, reversing, and querying commissions
   - Manages internal ledger wallet
   - Handles balance updates and statistics

3. **Admin Endpoints** (in `src/controllers/adminController.js`)
   - View internal ledger balance
   - Get commission statistics and reports
   - Monitor commission collection by source

### Internal Ledger User

The system automatically creates a special system account for managing the internal ledger:
- **Email**: `system.ledger@wavvapay.internal`
- **Username**: `wavva-ledger-system`
- **Status**: Verified system account (non-deletable)
- **Wallets**: Maintains separate ledgers for NGN and USD commissions

## How It Works

### 1. Commission Recording

When a transaction occurs with a fee, the system automatically:

1. **Calculates the fee** based on transaction type and currency
2. **Records the commission** to the internal ledger
   - Creates a `CommissionLedger` entry with full transaction details
   - Assigns a unique ledger entry number (format: `COM-YYYYMMDD-XXXXX`)
3. **Updates internal ledger wallet**
   - Credits the commission amount to the appropriate currency ledger
4. **Logs the transaction** for audit purposes

### 2. Fee Deduction Flow

**Before Commission Integration:**
```
User Balance: 1000
Send: 500 + Fee (5) = 505
Fee goes nowhere → LOST COMMISSION
Receiver gets: 500
```

**After Commission Integration:**
```
User Balance: 1000
Send: 500 + Fee (5) = 505
Fee recorded to Internal Ledger ✓
Internal Ledger Balance: +5
Receiver gets: 500
```

## Commission Sources

The system tracks commissions from the following transaction types:

| Source | Fee Type | Examples |
|--------|----------|----------|
| `p2p_transfer` | P2P transfer fee | User-to-user money transfers |
| `wallet_funding` | Deposit fee | Funding wallet via Paystack |
| `bank_transfer` | Withdrawal fee | Bank transfer/payout |
| `nfc_transfer` | NFC transfer fee | NFC-based peer transfers |
| `merchant_payment` | Payment fee | Merchant store checkout |
| `combine_split` | Split bill fee | Combine/group payment splits |
| `payment_request` | Payment request fee | Payment request settlement |
| `bill_payment` | Bill payment fee | Bill payments via voice |
| `other` | Custom fees | Other commission sources |

## Fee Percentages

### Current Fee Structure

**Naira (₦) - NGN**
- P2P Transfer: 0.75%
- Wallet Funding: 0.5%
- Bank Transfer: 1.0%
- International Transfer: 2.0%

**US Dollar ($) - USD**
- P2P Transfer: 1.0%
- Wallet Funding: 1.0%
- Bank Transfer: 1.5%
- International Transfer: 2.5%

*Fees are configured in `src/utils/feeCalculator.js`*

## API Endpoints

### Admin Ledger Endpoints

All endpoints require `authMiddleware` + `adminMiddleware`

#### 1. Get Ledger Balance
```http
GET /api/admin/ledger/balance?currency=NGN
```

**Response:**
```json
{
  "success": true,
  "ledger": {
    "balance": 5000000,
    "currency": "NGN",
    "formatted": "50000.00"
  }
}
```

#### 2. Get Commission Statistics
```http
GET /api/admin/ledger/stats?startDate=2024-01-01&endDate=2024-12-31&source=p2p_transfer&currency=NGN
```

**Query Parameters:**
- `startDate`: Start date (ISO format, defaults to 30 days ago)
- `endDate`: End date (ISO format, defaults to now)
- `source`: Commission source filter (optional)
- `currency`: Currency filter (optional)

**Response:**
```json
{
  "success": true,
  "stats": {
    "period": {
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-12-31T23:59:59Z"
    },
    "total": {
      "amount": 50000000,
      "formatted": "500000.00",
      "count": 1250,
      "average": "400.00",
      "min": "10.00",
      "max": "5000.00"
    },
    "bySource": [
      {
        "source": "p2p_transfer",
        "amount": 30000000,
        "formatted": "300000.00",
        "count": 750
      },
      {
        "source": "wallet_funding",
        "amount": 15000000,
        "formatted": "150000.00",
        "count": 500
      }
    ]
  }
}
```

#### 3. Get Ledger Entries (Paginated)
```http
GET /api/admin/ledger/entries?page=1&limit=20&source=p2p_transfer&currency=NGN
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `source`: Filter by commission source (optional)
- `currency`: Filter by currency (optional)

**Response:**
```json
{
  "success": true,
  "entries": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "ledgerEntry": "COM-20240115-00042",
      "amount": "1250.00",
      "currency": "NGN",
      "source": "p2p_transfer",
      "fromUser": "John Doe",
      "date": "2024-01-15T10:30:00Z",
      "description": "P2P transfer commission: john_doe → jane_smith"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1250,
    "pages": 63
  }
}
```

#### 4. Get Ledger Summary
```http
GET /api/admin/ledger/summary
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "currentBalance": {
      "NGN": {
        "balance": 50000000,
        "currency": "NGN",
        "formatted": "500000.00"
      },
      "USD": {
        "balance": 100000,
        "currency": "USD",
        "formatted": "1000.00"
      }
    },
    "thisMonth": {
      "NGN": {
        "amount": 5000000,
        "formatted": "50000.00",
        "count": 125
      },
      "USD": {
        "amount": 10000,
        "formatted": "100.00",
        "count": 25
      }
    },
    "allTime": {
      "NGN": {
        "amount": 50000000,
        "formatted": "500000.00",
        "count": 1250
      },
      "USD": {
        "amount": 100000,
        "formatted": "1000.00",
        "count": 250
      }
    }
  }
}
```

#### 5. Get Commission Report
```http
GET /api/admin/ledger/report
```

**Response:**
```json
{
  "success": true,
  "report": [
    {
      "source": "p2p_transfer",
      "currency": "NGN",
      "totalAmount": 30000000,
      "totalFormatted": "300000.00",
      "count": 750,
      "avgAmount": "400.00",
      "maxAmount": "5000.00",
      "minAmount": "10.00"
    },
    {
      "source": "wallet_funding",
      "currency": "NGN",
      "totalAmount": 15000000,
      "totalFormatted": "150000.00",
      "count": 500,
      "avgAmount": "300.00",
      "maxAmount": "2000.00",
      "minAmount": "50.00"
    }
  ],
  "generatedAt": "2024-01-15T14:30:00Z"
}
```

## Service Functions

### Commission Service API

Located in `src/services/commissionService.js`

#### recordCommission(commissionData)
Records a commission to the internal ledger and updates wallet balance.

```javascript
const commission = await recordCommission({
  transactionId: transaction._id,           // Reference to transaction
  amount: 5000,                             // In cents
  currency: 'NGN',
  source: 'p2p_transfer',
  fromUser: senderId,
  toUser: receiverId,
  feePercentage: 0.75,
  grossAmount: 100000,
  description: 'P2P transfer commission'
});
```

**Returns:** CommissionLedger document

#### reverseCommission(commissionId, reason)
Reverses a commission (for refunds/cancellations).

```javascript
const reversed = await reverseCommission(
  commissionId,
  'Transaction refunded - insufficient funds'
);
```

#### getLedgerBalance(currency)
Gets current internal ledger balance.

```javascript
const balance = await getLedgerBalance('NGN');
// Returns: { balance: 50000000, currency: 'NGN', formatted: '500000.00' }
```

#### getCommissionStats(filters)
Gets commission statistics for analysis.

```javascript
const stats = await getCommissionStats({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  source: 'p2p_transfer',
  currency: 'NGN'
});
```

#### getLedgerEntries(page, limit, filters)
Gets paginated ledger entries.

```javascript
const result = await getLedgerEntries(1, 20, { source: 'p2p_transfer' });
// Returns: { entries: [...], pagination: {...} }
```

## Database Schema

### CommissionLedger Model Fields

```javascript
{
  transactionId: ObjectId,           // Reference to transaction
  merchantTransactionId: ObjectId,   // For merchant payments
  amount: Number,                    // In cents
  currency: String,                  // 'NGN' or 'USD'
  source: String,                    // Type of commission source
  fromUser: ObjectId,                // User who paid the fee
  toUser: ObjectId,                  // Recipient (if applicable)
  merchantId: ObjectId,              // Merchant (if applicable)
  description: String,               // Commission description
  feePercentage: Number,             // Fee % charged
  grossAmount: Number,               // Original transaction amount
  status: String,                    // 'credited', 'pending', 'reversed'
  ledgerEntryNumber: String,         // Unique ID (COM-YYYYMMDD-XXXXX)
  notes: String,                     // Additional notes
  createdAt: Date,
  updatedAt: Date
}
```

## Implementation Examples

### Example 1: P2P Transfer with Commission

```javascript
// User sends 100,000 NAIRA with 0.75% fee
const amount = 10000000; // 100,000 in cents
const { feeAmount, netAmount, feePercentage } = calculateFee(amount, 'NGN', 'p2p_transfer');
// Result: { feePercentage: 0.75, feeAmount: 75000, netAmount: 9925000 }

// Create transaction
const transaction = new Transaction({
  sender: senderId,
  receiver: receiverId,
  amount,
  feeAmount,
  netAmount,
  feePercentage,
  type: 'peer-to-peer'
});
await transaction.save();

// Update wallets
senderWallet.balance -= (amount + feeAmount);  // Deduct 100,000 + fee
receiverWallet.balance += amount;              // Receiver gets 100,000

// Record commission to internal ledger ✓
await recordCommission({
  transactionId: transaction._id,
  amount: feeAmount,                 // 750 NAIRA (0.75%)
  currency: 'NGN',
  source: 'p2p_transfer',
  fromUser: senderId,
  toUser: receiverId,
  feePercentage: 0.75,
  grossAmount: amount,
  description: `P2P transfer: User A → User B`
});
```

### Example 2: Wallet Funding with Commission

```javascript
// User deposits 50,000 NAIRA via Paystack with 0.5% fee
const amount = 5000000; // 50,000 in cents
const { feeAmount } = calculateFee(amount, 'NGN', 'wallet_funding');
// Result: feeAmount = 25,000 cents (250 NAIRA)

// Create transaction
const transaction = new Transaction({
  sender: userId,
  amount,
  feeAmount,
  type: 'wallet_funding',
  method: 'paystack'
});
await transaction.save();

// Update wallet (only credit netAmount after fee)
const creditAmount = amount - feeAmount;
wallet.getOrCreateWallet('NGN').balance += creditAmount; // +49,750 NAIRA

// Record commission ✓
await recordCommission({
  transactionId: transaction._id,
  amount: feeAmount,         // 250 NAIRA
  currency: 'NGN',
  source: 'wallet_funding',
  fromUser: userId,
  feePercentage: 0.5,
  grossAmount: amount,
  description: `Wallet funding via Paystack`
});
```

### Example 3: Checking Ledger Balance

```javascript
// Admin checks total commissions collected
const ngnBalance = await getLedgerBalance('NGN');
const usdBalance = await getLedgerBalance('USD');

console.log(`NGN Ledger: ${ngnBalance.formatted}`);  // ₦50,000.00
console.log(`USD Ledger: ${usdBalance.formatted}`);  // $1,000.00
```

### Example 4: Getting Commission Report

```javascript
// Get commission breakdown for January 2024
const stats = await getCommissionStats({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
});

console.log(`Total Collected: ${stats.total.formatted} NGN`);
console.log(`Total Transactions: ${stats.total.count}`);
console.log(`Average Commission: ${stats.total.average} NGN`);

// By source breakdown
stats.bySource.forEach(item => {
  console.log(`${item.source}: ${item.formatted} (${item.count} transactions)`);
});
```

## Audit Trail

Every commission is tracked with:
1. **Unique Ledger Entry Number**: `COM-YYYYMMDD-XXXXX`
2. **Source Transaction**: Link to original transaction
3. **User Information**: Who paid the fee
4. **Timestamp**: When commission was recorded
5. **Status**: credited/pending/reversed

This ensures complete transparency and auditability.

## Refund Handling

When a transaction is refunded:

```javascript
// Original transaction has fee recorded
// To refund:
await reverseCommission(commissionId, 'Customer refund - quality issue');

// This:
// 1. Marks commission as 'reversed'
// 2. Deducts from internal ledger balance
// 3. Logs reversal reason
// 4. Maintains audit trail
```

## Reconciliation

### Monthly Reconciliation
```
Expected = Total Transaction Fees
Actual = Internal Ledger Balance
Reconciled = Expected === Actual (accounting for reversals)
```

### Validation Report
```http
GET /api/admin/ledger/report
```

Generates breakdown by source to identify any discrepancies.

## Security Considerations

1. **Commission Recording is Automatic**
   - No manual entry possible
   - Reduces human error and fraud risk

2. **Immutable Ledger Entries**
   - Cannot modify historical entries
   - Only reversals allowed (with reason)

3. **Admin-Only Access**
   - All endpoints require admin authentication
   - Commission Service is internal

4. **Audit Trail**
   - Every entry tracked with timestamp
   - Reversal reasons logged
   - User information preserved

## Migration Guide (If Implementing)

For existing installations, run migration to backfill commission ledger:

```bash
# To be implemented as needed
npm run migrate:commissions
```

This would:
1. Read all completed transactions
2. Calculate fees retroactively
3. Populate CommissionLedger
4. Update internal ledger balance

## Troubleshooting

### Issue: Ledger Balance Not Updating

**Cause**: Commission service not called after transaction
**Solution**: Verify `recordCommission()` is called in all transaction handlers

### Issue: Commission Amount Wrong

**Cause**: Fee calculation changed
**Solution**: Check `feeCalculator.js` for correct percentages

### Issue: Internal Ledger User Not Found

**Cause**: System account not created
**Solution**: Service auto-creates on first `recordCommission()` call

## Conclusion

The Internal Commission Ledger System provides:
✅ Automatic commission tracking
✅ Real-time balance updates
✅ Comprehensive reporting
✅ Complete audit trail
✅ Admin oversight capabilities
✅ Refund handling
✅ Multi-currency support

All fees collected from wallet transactions are now properly tracked and managed through a dedicated internal ledger.
