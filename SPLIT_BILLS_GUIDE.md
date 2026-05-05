# Split Bills & Group Payments Guide

## Overview

WavvaPay now supports comprehensive split bill and group payment functionality. This enables users to:
- Create group expenses and split them fairly
- Send payment requests to multiple people for shared expenses
- Manage group finances with optimal settlement calculations
- Track who owes whom and settle debts efficiently

## Features

### 1. **Combine Groups** (Group Expense Management)
A "Combine" is a group of users collaborating to manage shared expenses.

#### Key Endpoints:
- `POST /api/combines` - Create a new group
- `GET /api/combines` - List all your groups
- `GET /api/combines/:combineId` - Get group details
- `POST /api/combines/:combineId/expenses` - Add an expense to the group
- `GET /api/combines/:combineId/balances` - Get who owes whom
- `POST /api/combines/:combineId/settle-optimized` - Settle all debts with minimum transactions

#### Example: Create a Combine
```json
POST /api/combines
{
  "name": "Weekend Trip",
  "description": "Weekend getaway expenses",
  "members": ["user_id_1", "user_id_2", "user_id_3"],
  "currency": "NGN"
}
```

#### Example: Add an Expense
```json
POST /api/combines/{combineId}/expenses
{
  "description": "Hotel booking",
  "amount": 150000,
  "paidBy": "user_id_1",
  "splitAmong": ["user_id_1", "user_id_2", "user_id_3"]
}
```

#### Example: Check Balances
```json
GET /api/combines/{combineId}/balances

Response:
{
  "balances": [
    { "userId": "user_id_1", "balance": 50000 },
    { "userId": "user_id_2", "balance": -25000 },
    { "userId": "user_id_3", "balance": -25000 }
  ],
  "settlements": [
    { "from": "user_id_2", "to": "user_id_1", "amount": "250.00" },
    { "from": "user_id_3", "to": "user_id_1", "amount": "250.00" }
  ]
}
```

### 2. **Payment Requests** (Send Money Requests to Multiple People)
Payment Requests allow you to request money from specific people for shared expenses.

#### Key Endpoints:
- `POST /api/payment-requests` - Create a payment request
- `GET /api/payment-requests` - List all your payment requests
- `GET /api/payment-requests/:requestId` - Get request details
- `POST /api/payment-requests/:requestId/respond` - Accept or decline a request
- `POST /api/payment-requests/:requestId/pay` - Make a payment
- `POST /api/payment-requests/:requestId/create-payment-links` - Create Paystack payment links
- `POST /api/payment-requests/:requestId/cancel` - Cancel a request
- `GET /api/payment-requests/analytics/summary` - Get your payment request analytics

#### Split Types

**Equal Split**: Each participant pays the same amount
```json
POST /api/payment-requests
{
  "title": "Dinner Bill",
  "totalAmount": 30000,
  "participants": ["user_id_1", "user_id_2", "user_id_3"],
  "splitType": "equal",
  "dueDate": "2026-03-10"
}
```

**Proportional Split**: Participants pay based on custom percentages
```json
{
  "title": "Team Lunch",
  "totalAmount": 50000,
  "participants": [
    { "userId": "user_id_1", "sharePercentage": 50 },
    { "userId": "user_id_2", "sharePercentage": 30 },
    { "userId": "user_id_3", "sharePercentage": 20 }
  ],
  "splitType": "proportional"
}
```

**Custom Split**: Specify exact amount each person owes
```json
{
  "title": "Shared Groceries",
  "totalAmount": 25000,
  "participants": [
    { "userId": "user_id_1", "customAmount": 15000 },
    { "userId": "user_id_2", "customAmount": 10000 }
  ],
  "splitType": "custom"
}
```

**Itemized Split**: Assign specific items to specific people
```json
{
  "title": "Restaurant Bill",
  "totalAmount": 45000,
  "participants": ["user_id_1", "user_id_2", "user_id_3"],
  "splitType": "itemized",
  "items": [
    {
      "description": "Steak",
      "amount": 15000,
      "assignedTo": ["user_id_1"]
    },
    {
      "description": "Pasta",
      "amount": 12000,
      "assignedTo": ["user_id_2"]
    },
    {
      "description": "Salad",
      "amount": 18000,
      "assignedTo": ["user_id_1", "user_id_3"]
    }
  ]
}
```

#### Payment Request Lifecycle

1. **Create Request**: Initiator creates payment request with participants and split details
2. **Notify Participants**: System sends notifications to all participants
3. **Respond**: Participants accept or decline the request
4. **Accept Payment**: Participant makes payment online via Paystack or manually records payment
5. **Track Status**: Request updates to "partially_paid" or "fully_paid"
6. **Settlement Complete**: Request marked as "fully_paid"

#### Example: Accept a Payment Request
```json
POST /api/payment-requests/{requestId}/respond
{
  "action": "accept"
}
```

#### Example: Make a Payment
```json
POST /api/payment-requests/{requestId}/pay
{
  "amount": 10000,
  "paymentMethod": "paystack"
}
```

### 3. **Expenses** (Track Individual Expenses in a Group)
Expenses are individual transactions within a Combine that track who paid and who owes.

Expenses are created automatically when you add them to a Combine:
```json
POST /api/combines/{combineId}/expenses
{
  "description": "Dinner",
  "amount": 30000,
  "paidBy": "user_id_1",
  "splitAmong": ["user_id_1", "user_id_2", "user_id_3"]
}
```

## Data Models

### Combine
```javascript
{
  _id: ObjectId,
  name: String,                    // e.g., "Weekend Trip"
  description: String,
  createdBy: ObjectId,             // User ID of admin
  members: [
    {
      userId: ObjectId,
      role: "admin" | "member",
      joinedAt: Date
    }
  ],
  totalAmount: Number,             // in cents
  currency: String,                // USD or NGN
  expenses: [ObjectId],            // Array of Expense IDs
  settled: Boolean,
  settledAt: Date,
  status: "active" | "archived",
  createdAt: Date,
  updatedAt: Date
}
```

### PaymentRequest
```javascript
{
  _id: ObjectId,
  title: String,                   // e.g., "Dinner Bill"
  description: String,
  requestedBy: ObjectId,           // User ID,
  totalAmount: Number,             // in cents
  currency: String,                // USD or NGN
  splitType: "equal" | "proportional" | "custom" | "itemized",
  participants: [
    {
      userId: ObjectId,
      dueAmount: Number,           // in cents
      paidAmount: Number,          // in cents
      status: "pending" | "accepted" | "declined" | "paid",
      sharePercentage: Number,     // For proportional splits
      customAmount: Number,        // For custom splits
      itemizedAmount: Number       // For itemized splits
    }
  ],
  items: [
    {
      description: String,
      amount: Number,
      assignedTo: [ObjectId]
    }
  ],
  status: "draft" | "active" | "partially_paid" | "fully_paid" | "cancelled",
  dueDate: Date,
  expireDate: Date,
  totalPaid: Number,               // in cents
  totalPending: Number,            // in cents
  totalDeclined: Number,           // in cents
  transactionIds: [ObjectId],
  createdAt: Date,
  updatedAt: Date
}
```

### Expense
```javascript
{
  _id: ObjectId,
  combineId: ObjectId,
  description: String,
  amount: Number,                  // in cents
  currency: String,
  paidBy: ObjectId,                // User ID
  splitAmong: [ObjectId],          // Array of User IDs
  splitAmount: Number,             // Per-person amount in cents
  createdAt: Date,
  updatedAt: Date
}
```

## Settlement Algorithm

WavvaPay uses an **optimized settlement algorithm** that minimizes the number of transactions needed.

### Example:
If you have balances:
- User A: +50 (receives ₦500)
- User B: -25 (owes ₦250)
- User C: -25 (owes ₦250)

Instead of 2 transactions, it calculates just 2 minimum transactions:
- B pays A: ₦250
- C pays A: ₦250

## Workflow Examples

### Scenario 1: Split a Dinner Bill
```javascript
// 1. Create payment request
POST /api/payment-requests
{
  "title": "Dinner at Restaurant",
  "totalAmount": 45000,              // ₦450 total
  "participants": ["user_2", "user_3"],
  "splitType": "equal",
  "dueDate": "2026-03-05"
}

// 2. User_2 and User_3 receive notification
// They can accept/decline and see their due amount (₦225 each)

// 3. They make payment
POST /api/payment-requests/{requestId}/pay
{
  "amount": 22500,                  // ₦225
  "paymentMethod": "paystack"
}

// 4. Status updates to "fully_paid" when all payments received
```

### Scenario 2: Split Group Trip Expenses
```javascript
// 1. Create a Combine group
POST /api/combines
{
  "name": "Beach Trip 2026",
  "members": ["user_2", "user_3", "user_4"]
}

// 2. Add expenses as trips happen
POST /api/combines/{combineId}/expenses
{ "description": "Gas", "amount": 20000, "paidBy": "user_1", 
  "splitAmong": ["user_1", "user_2", "user_3", "user_4"] }

POST /api/combines/{combineId}/expenses
{ "description": "Hotel", "amount": 200000, "paidBy": "user_2", 
  "splitAmong": ["user_1", "user_2", "user_3", "user_4"] }

// 3. Check balances anytime
GET /api/combines/{combineId}/balances
// Shows who owes whom

// 4. Settle with optimal transactions
POST /api/combines/{combineId}/settle-optimized
// Calculates minimum transactions and records them
```

### Scenario 3: Proportional Split (Team Lunch)
```javascript
// Different roles, different budgets
POST /api/payment-requests
{
  "title": "Team Lunch",
  "totalAmount": 60000,              // ₦600
  "participants": [
    { "userId": "manager", "sharePercentage": 40 },    // ₦240
    { "userId": "engineer_1", "sharePercentage": 30 }, // ₦180
    { "userId": "engineer_2", "sharePercentage": 30 }  // ₦180
  ],
  "splitType": "proportional"
}
```

## Key APIs Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/combines` | POST | Create a group |
| `/api/combines` | GET | List your groups |
| `/api/combines/:id/expenses` | POST | Add expense |
| `/api/combines/:id/balances` | GET | See balances |
| `/api/combines/:id/settle-optimized` | POST | Settle group |
| `/api/payment-requests` | POST | Create payment request |
| `/api/payment-requests` | GET | List requests |
| `/api/payment-requests/:id/respond` | POST | Accept/decline |
| `/api/payment-requests/:id/pay` | POST | Make payment |
| `/api/payment-requests/analytics/summary` | GET | Get analytics |

## Best Practices

1. **Use Combines for ongoing groups**: Trip, roommate expenses, shared projects
2. **Use Payment Requests for quick splits**: One-time dinners, events
3. **Set due dates**: Help remind people to pay
4. **Use itemized splits**: For restaurant bills or shopping where items vary by person
5. **Check balances before settling**: Make sure amounts are correct
6. **Settle promptly**: Don't let debts accumulate

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| "Cannot include yourself as a participant" | Initiator in participants | Remove yourself from participants list |
| "Payment amount exceeds due amount" | Paying more than owed | Check due amount and pay correct amount |
| "Only requester can create payment links" | Wrong user | Must be payment request creator |
| "User not found" | Invalid user ID | Verify user IDs are correct |
| "Combine not found" | Invalid combine ID | Check combine ID |

## Future Enhancements

- [ ] Recurring split payments (monthly rent splits)
- [ ] Blockchain-based settlement verification
- [ ] AI-powered fair split suggestions
- [ ] Integration with expense tracking apps
- [ ] Automated payment reminders
- [ ] Split payment disputes and resolution
- [ ] Group budgeting tools
- [ ] Historical transaction analysis

## Support

For issues or questions about split bills and group payments:
1. Check this guide
2. Review API documentation
3. Check error messages
4. Contact support team
