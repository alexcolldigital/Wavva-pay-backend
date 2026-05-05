const mongoose = require('mongoose');

const paymentRequestSchema = new mongoose.Schema({
  // Request Details
  title: { type: String, required: true }, // e.g., "Dinner Bill", "Trip Expenses"
  description: String,
  
  // Initiator
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Payment Details
  totalAmount: { type: Number, required: true }, // in cents
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  
  // Split Information
  splitType: {
    type: String,
    enum: ['equal', 'proportional', 'custom', 'itemized'],
    default: 'equal'
  },
  
  // Participants
  participants: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sharePercentage: { type: Number }, // For proportional splits
    customAmount: { type: Number }, // For custom splits (in cents)
    itemizedAmount: { type: Number }, // For itemized splits (in cents)
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'paid'],
      default: 'pending'
    },
    paidAmount: { type: Number, default: 0 }, // Amount actually paid
    dueAmount: { type: Number }, // Amount due (calculated based on split)
    paymentDate: Date,
    declineReason: String,
    declinedAt: Date,
    _id: false
  }],
  
  // Payment Links (for Paystack integration)
  paymentLinks: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paymentLinkId: String, // Paystack payment link ID
    paymentUrl: String,
    _id: false
  }],
  
  // Items (for itemized splits)
  items: [{
    description: String,
    amount: Number, // in cents
    quantity: Number,
    unitPrice: Number, // in cents
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    _id: false
  }],
  
  // Status & Timeline
  status: {
    type: String,
    enum: ['draft', 'active', 'partially_paid', 'fully_paid', 'expired', 'cancelled'],
    default: 'active'
  },
  
  dueDate: Date,
  expireDate: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  cancelledAt: Date,
  cancelReason: String,
  
  // Settlement
  settlementMethod: {
    type: String,
    enum: ['immediate', 'manual', 'scheduled'],
    default: 'immediate'
  },
  
  totalPaid: { type: Number, default: 0 }, // in cents
  totalPending: { type: Number }, // in cents
  totalDeclined: { type: Number, default: 0 }, // in cents
  
  // Related Transactions
  transactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }],
  combineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Combine' }, // Link to combine if created from one
  
  // Notifications
  remindersSent: [{ type: Date }],
  lastReminderSent: Date,
  
  // Metadata
  metadata: {
    location: String,
    category: String,
    tags: [String],
    customFields: Map
  },
  
  // Notes
  notes: String,
  
}, { timestamps: true });

// Indexes
paymentRequestSchema.index({ requestedBy: 1, createdAt: -1 });
paymentRequestSchema.index({ 'participants.userId': 1 });
paymentRequestSchema.index({ status: 1 });
paymentRequestSchema.index({ expireDate: 1 });

// Calculate due amounts for participants
paymentRequestSchema.pre('save', function(next) {
  if (this.isModified('participants') || this.isModified('totalAmount') || this.isModified('splitType')) {
    let totalDue = 0;
    
    this.participants.forEach(participant => {
      let dueAmount = 0;
      
      if (this.splitType === 'equal') {
        dueAmount = Math.floor(this.totalAmount / this.participants.length);
      } else if (this.splitType === 'proportional') {
        const percentage = participant.sharePercentage || (100 / this.participants.length);
        dueAmount = Math.round((percentage / 100) * this.totalAmount);
      } else if (this.splitType === 'custom') {
        dueAmount = participant.customAmount || 0;
      } else if (this.splitType === 'itemized') {
        dueAmount = participant.itemizedAmount || 0;
      }
      
      participant.dueAmount = dueAmount;
      totalDue += dueAmount;
    });
    
    this.totalPending = totalDue;
  }
  
  next();
});

module.exports = mongoose.model('PaymentRequest', paymentRequestSchema);
