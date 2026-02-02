const mongoose = require('mongoose');

const combineSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., "Weekend Trip"
  description: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  }],
  
  // Bill splitting
  totalAmount: { type: Number, default: 0 }, // in cents
  currency: { type: String, default: 'NGN' },
  expenses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }],
  
  // Settlement
  settled: { type: Boolean, default: false },
  settledAt: Date,
  
  // Status
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Combine', combineSchema);
