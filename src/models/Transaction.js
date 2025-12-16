const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  amount: { type: Number, required: true }, // in cents
  currency: { type: String, default: 'USD' },
  
  type: { 
    type: String, 
    enum: ['peer-to-peer', 'combine-split', 'payout'], 
    required: true 
  },
  
  // Chimoney integration
  chimonyTransactionId: String,
  chimonyStatus: { type: String, default: 'pending' }, // pending, completed, failed
  
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
  method: String, // bank_transfer, mobile_money, chimoney, etc.
  metadata: mongoose.Schema.Types.Mixed,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
