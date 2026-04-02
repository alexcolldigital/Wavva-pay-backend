const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  category: {
    type: String,
    enum: [
      'account',
      'payment',
      'security',
      'technical',
      'billing',
      'kyc',
      'other'
    ],
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open',
    index: true
  },
  responses: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    isAdmin: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  attachments: [{
    filename: String,
    url: String,
    size: Number,
    mimeType: String
  }],
  resolvedAt: Date,
  closedAt: Date
}, {
  timestamps: true
});

// Indexes
supportTicketSchema.index({ userId: 1, status: 1 });
supportTicketSchema.index({ status: 1, priority: 1 });
supportTicketSchema.index({ createdAt: -1 });

// Static method to get ticket stats
supportTicketSchema.statics.getTicketStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    open: stats.find(s => s._id === 'open')?.count || 0,
    inProgress: stats.find(s => s._id === 'in_progress')?.count || 0,
    resolved: stats.find(s => s._id === 'resolved')?.count || 0,
    closed: stats.find(s => s._id === 'closed')?.count || 0,
    total: stats.reduce((sum, stat) => sum + stat.count, 0)
  };
};

module.exports = mongoose.model('SupportTicket', supportTicketSchema);