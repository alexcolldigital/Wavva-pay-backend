# Flutterwave Integration Guide

## Overview
This document outlines the complete migration from Chimoney to Flutterwave for handling payments in the Wavva Pay application.

## Changes Made

### Backend Changes

#### 1. New Flutterwave Service (`backend/src/services/flutterwave.js`)
Created a comprehensive Flutterwave service with the following methods:

- **`initializePayment(email, amount, currency, metadata)`**
  - Initializes a payment session
  - Returns: `{ success, paymentLink, transactionRef }`
  - Generates unique transaction reference: `WVP-{timestamp}-{random}`

- **`verifyPayment(transactionId)`**
  - Verifies payment status after callback
  - Returns: `{ success, transactionId, reference, amount, currency, status, paymentMethod }`

- **`getTransactionDetails(transactionId)`**
  - Fetches detailed transaction information
  - Returns: `{ transactionId, reference, amount, currency, status, paymentMethod, customer, timestamp }`

- **`createTransfer(account_number, account_bank, amount, currency, narrative)`**
  - Creates bank transfers for P2P payments
  - Returns: `{ success, transferId, reference, status }`

- **`getTransferStatus(transferId)`**
  - Checks transfer status
  - Returns: `{ success, transferId, status, amount }`

#### 2. Updated Payments Routes (`backend/src/routes/payments.js`)
- Replaced Chimoney imports with Flutterwave
- **New Endpoint: `POST /payments/fund/initialize`**
  - Initiates wallet funding via Flutterwave
  - Request: `{ amount, currency }`
  - Response: `{ success, paymentLink, transactionRef }`

- **New Endpoint: `POST /payments/fund/verify`**
  - Verifies payment and credits wallet
  - Request: `{ transactionId }`
  - Response: `{ success, transactionId, message, newBalance }`

- **Updated Endpoint: `POST /payments/send`**
  - Now uses internal P2P transfers (no external payment processor)
  - Direct balance transfer between users
  - Method: `internal`

#### 3. Transaction Model Updates (`backend/src/models/Transaction.js`)
- Added new transaction type: `wallet_funding`
- Added Flutterwave fields:
  - `flutterwaveTransactionId`
  - `flutterwaveReference`
- Made `receiver` field optional (for wallet funding transactions)
- Added `wallet_funding` to transaction type enum
- Kept Chimoney fields for backward compatibility

#### 4. Environment Configuration (`backend/.env`)
Added Flutterwave configuration:
```env
FLUTTERWAVE_SECRET_KEY=your-flutterwave-secret-key
FLUTTERWAVE_PUBLIC_KEY=your-flutterwave-public-key
FLUTTERWAVE_BASE_URL=https://api.flutterwave.com/v3
```

### Frontend Changes

#### 1. Wallet Service Updates (`frontend/src/services/api/walletService.ts`)
Added two new methods:

- **`initializeFlutterwavePayment(amount, currency)`**
  - Calls: `POST /payments/fund/initialize`
  - Returns: `{ success, paymentLink, transactionRef }`

- **`verifyFlutterwavePayment(transactionId)`**
  - Calls: `POST /payments/fund/verify`
  - Returns: `{ success, transactionId, message, newBalance }`

#### 2. Wallet Page Updates (`frontend/src/pages/wallet/WalletPage.tsx`)
Modified `handleAddFunds()` function:
- Now calls Flutterwave payment initialization
- Stores transaction reference in localStorage
- Redirects to Flutterwave payment page
- Removed local balance update (handled by verification)

#### 3. New Payment Verification Page (`frontend/src/pages/payments/VerifyPaymentPage.tsx`)
Created comprehensive verification page:
- Displays loading state while verifying
- Shows success message with new balance
- Shows error message with option to retry
- Auto-redirects to wallet on success (3 seconds)
- Handles callback from Flutterwave redirect

#### 4. App Routes Update (`frontend/src/App.tsx`)
- Added new route: `/payments/verify` → `VerifyPaymentPage`
- This is the redirect URL configured in Flutterwave payment initialization

## Payment Flow

### Add Funds Flow
1. User enters amount in WalletPage "Add Funds" modal
2. Frontend calls `walletService.initializeFlutterwavePayment(amount, currency)`
3. Backend initializes payment via Flutterwave API, returns payment link
4. Frontend redirects user to Flutterwave payment page
5. User completes payment on Flutterwave
6. Flutterwave redirects back to `/payments/verify?transaction_id=...&status=...`
7. VerifyPaymentPage verifies payment with backend
8. Backend credits user's wallet and creates transaction record
9. Frontend shows success and redirects to wallet

### Send Money Flow (P2P)
1. User selects recipient and enters amount in SendMoneyPage
2. User confirms payment
3. Frontend calls `paymentService.sendMoney(receiverId, amount, currency, description)`
4. Backend performs internal transfer:
   - Deducts from sender's wallet
   - Adds to receiver's wallet
   - Creates transaction record (method: `internal`)
5. Frontend shows success screen

## Integration Steps for Developers

### 1. Get Flutterwave Credentials
1. Sign up at https://flutterwave.com
2. Create a Rave account
3. Get Secret Key and Public Key from dashboard
4. Copy to `.env` file:
```env
FLUTTERWAVE_SECRET_KEY=sk_test_xxxxx
FLUTTERWAVE_PUBLIC_KEY=pk_test_xxxxx
```

### 2. Configure Redirect URL
In Flutterwave Dashboard:
1. Set redirect URL to: `https://yourdomain.com/payments/verify`
2. For local development: `http://localhost:5173/payments/verify`

### 3. Test the Integration
```bash
# Backend
npm run seed # Populate test data
npm start    # Start server

# Frontend
npm start    # Start dev server

# Test flow:
1. Login as john@wavvapay.com / password123
2. Go to Wallet
3. Click "Add Funds"
4. Enter amount and complete Flutterwave payment
5. Verify that wallet balance updates
```

## API Endpoints Summary

### Wallet Funding
- **POST** `/api/payments/fund/initialize`
  - Initialize Flutterwave payment
  - Body: `{ amount: number, currency: string }`
  - Response: `{ success: boolean, paymentLink: string, transactionRef: string }`

- **POST** `/api/payments/fund/verify`
  - Verify and credit wallet
  - Body: `{ transactionId: string }`
  - Response: `{ success: boolean, transactionId: string, message: string, newBalance: number }`

### P2P Transfers
- **POST** `/api/payments/send`
  - Send money to another user (internal transfer)
  - Body: `{ receiverId: string, amount: number, currency: string, description?: string }`
  - Response: `{ success: boolean, transactionId: string, message: string }`

### Transaction Info
- **GET** `/api/payments/transaction-status/:transactionId`
  - Get transaction details
  - Response: `{ transactionId, status, amount, currency, type, createdAt }`

## Security Considerations

1. **Verification Required**: Always verify payment status with Flutterwave before crediting wallet
2. **Transaction Reference**: Unique reference prevents duplicate charges
3. **User Isolation**: Verify user ownership before crediting/debiting
4. **Error Handling**: Graceful fallback for failed verifications
5. **Logging**: All payment operations are logged for audit trail

## Testing Credentials

For testing with Flutterwave sandbox:
- Card: 4242 4242 4242 4242
- Expiry: 09/32
- CVV: 812
- OTP: 12345

## Backward Compatibility

- Chimoney fields are retained in Transaction model for migration purposes
- Old transactions with Chimoney data remain unchanged
- New transactions use Flutterwave exclusively
- Can run both systems in parallel during transition

## Troubleshooting

### Payment Link Not Working
- Verify `FLUTTERWAVE_SECRET_KEY` is correct
- Check redirect URL is configured in Flutterwave dashboard
- Ensure currency is supported by Flutterwave

### Verification Failing
- Confirm transaction ID is passed correctly
- Check transaction status in Flutterwave dashboard
- Verify user is authenticated (has valid JWT token)

### Balance Not Updating
- Check backend logs for verification errors
- Verify user has wallet record
- Check transaction is marked as 'completed' status

## Next Steps

1. Configure Flutterwave test credentials
2. Test full payment flow with test card
3. Deploy to production with live credentials
4. Monitor transaction logs for any issues
5. Consider adding Flutterwave webhook support for asynchronous verification
