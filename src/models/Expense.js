const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  combineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Combine', required: true },
  description: { type: String, required: true },
  amount: { type: Number, required: true }, // in cents
  currency: { type: String, default: 'NGN' },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  splitAmong: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // who owes
  splitAmount: { type: Number }, // per person amount in cents
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
