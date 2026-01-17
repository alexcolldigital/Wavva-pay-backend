# Paystack Integration for Wavva Pay

## Overview

Wavva Pay uses **Paystack** for secure payment processing. This replaces the previous Flutterwave integration. Paystack provides a custom payment form/modal that you can embed directly in your application.

## Key Features

- **Custom Payment Modal**: No redirect needed - payments happen in-app
- **Multiple Payment Methods**: Card, Bank Transfer, USSD, Mobile Money
- **Instant Verification**: Real-time payment confirmation
- **Security**: PCI DSS compliant payment processing
- **Nigeria Focus**: Optimized for Nigerian payment methods

## Setup Instructions

### Step 1: Get Paystack Credentials

1. Sign up at [Paystack](https://paystack.com)
2. Complete your business verification
3. Go to **Settings → API Keys & Webhooks**
4. Copy your **Secret Key** and **Public Key**

### Step 2: Configure Backend Environment

Update `backend/.env`:

```env
# Paystack Configuration
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
```

**Important:**
- Use **Test Keys** for development
- Use **Live Keys** for production
- Never commit keys to version control

### Step 3: Configure Frontend Environment

Update `frontend/.env`:

```env
# Paystack Configuration (use PUBLIC key only)
VITE_PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 4: Include Paystack JS Library

The PaystackPaymentModal component automatically loads the Paystack JS library from their CDN.

## How It Works

### Payment Flow

1. **User clicks "Add Funds"** → Opens PaystackPaymentModal
2. **Modal initializes payment** → Backend creates transaction reference
3. **Paystack modal opens** → User selects payment method and completes payment
4. **Backend verifies payment** → Checks with Paystack API
5. **Wallet is credited** → Funds added minus transaction fee

### Supported Payment Methods

- 💳 Card (Visa, Mastercard, Verve)
- 🏦 Bank Transfer
- 📱 USSD
- 📲 Mobile Money

## API Endpoints

### Initialize Payment
```
POST /api/payments/fund/initialize
Body: { amount: number, currency: 'NGN' }
Response: { authorizationUrl, reference, accessCode }
```

### Verify Payment
```
POST /api/payments/fund/verify
Body: { reference: string }
Response: { success, transactionId, payment, newBalance }
```

### Get Banks
```
GET /api/payments/banks
Response: { banks: [...] }
```

### Resolve Account
```
POST /api/payments/resolve-account
Body: { account_number, bank_code }
Response: { accountName, accountNumber }
```

## Transaction Fees

Fees are automatically calculated based on transaction type:

- **Wallet Funding**: Default percentage (e.g., 1.5%)
- **P2P Transfer**: 1% of amount
- **Bank Transfer**: 2% + fixed fee

Fees are deducted from the amount credited to the user's wallet.

## Error Handling

### Common Errors

| Error | Solution |
|-------|----------|
| Invalid credentials | Verify keys in `.env` file |
| Payment not completed | User cancelled or connection lost |
| Account resolution failed | Check account number and bank code |
| Insufficient funds | User needs more balance |

## Testing

### Test Cards (Development Only)

Paystack provides test cards in their documentation:

- **Card**: 4084084084084081
- **CVV**: Any 3 digits
- **Expiry**: Any future date

### Test Bank Accounts

Use the bank resolution endpoint to test account verification.

## Production Checklist

Before going live:

- [ ] Switch to **Live Keys** in environment variables
- [ ] Test with real payment methods
- [ ] Verify all transaction types (card, bank, USSD)
- [ ] Set up webhook handler for payment confirmations
- [ ] Enable logging and monitoring
- [ ] Test error scenarios and timeouts

## Webhooks (Optional)

For robust payment handling, implement webhooks:

```javascript
// Backend endpoint to handle Paystack events
POST /api/webhooks/paystack
Body: { event, data }
```

Common events:
- `charge.success` - Payment completed
- `charge.failed` - Payment failed
- `transfer.success` - Withdrawal completed

## Migration from Flutterwave

If migrating from Flutterwave:

1. Old transactions remain in DB with `flutterwaveTransactionId`
2. New transactions use `paystackTransactionId` and `paystackReference`
3. Payment methods field indicates which provider was used
4. No user action needed - system handles both

## Support & Documentation

- [Paystack Docs](https://paystack.com/docs)
- [Paystack API Reference](https://paystack.com/docs/api)
- [Test Credentials](https://paystack.com/docs/testing)
- [Paystack Support](https://support.paystack.com)

## Transaction Schema

```javascript
{
  // Paystack specific
  paystackTransactionId: String,
  paystackReference: String,
  
  // Transaction details
  amount: Number, // in cents
  currency: String, // 'NGN'
  feeAmount: Number,
  netAmount: Number,
  
  // Status
  status: 'pending' | 'completed' | 'failed',
  method: 'paystack' | 'bank_transfer' | 'internal'
}
```

## FAQ

**Q: Can I use both Paystack and Flutterwave?**
A: Yes, the system supports both. Use Paystack for new transactions.

**Q: What if payment verification fails?**
A: The backend retries verification and logs the error. User can retry from the wallet page.

**Q: Is PCI compliance required?**
A: Paystack handles PCI compliance. You never see card details in your system.

**Q: Can I process withdrawals?**
A: Yes, use the bank transfer endpoint with bank resolution and transfer recipient creation.
