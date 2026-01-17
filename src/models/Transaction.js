const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional for wallet funding
  
  amount: { type: Number, required: true }, // in cents
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  
  // Transaction fees (in cents)
  feePercentage: { type: Number }, // Percentage charged (e.g., 1 for 1%, 1.5 for 1.5%)
  feeAmount: { type: Number, default: 0 }, // Actual fee charged in cents
  netAmount: { type: Number }, // Amount after fee (amount - feeAmount)
  
  type: { 
    type: String, 
    enum: ['peer-to-peer', 'combine-split', 'payout', 'wallet_funding'], 
    required: true 
  },
  
  // Chimoney integration (deprecated but kept for backward compatibility)
  chimonyTransactionId: String,
  chimonyStatus: { type: String, default: 'pending' },
  
  // Paystack integration
  paystackTransactionId: String,
  paystackReference: String,
  
  // Flutterwave integration (deprecated but kept for backward compatibility)
  flutterwaveTransactionId: String,
  flutterwaveReference: String,
  
  // Details
  description: String,
  combineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Combine' }, // if part of combine
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Metadata
  method: String, // bank_transfer, mobile_money, paystack, internal, etc.
  metadata: mongoose.Schema.Types.Mixed,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
