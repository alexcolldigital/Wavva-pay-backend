const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  category: {
    type: String,
    enum: [
      'bug',
      'feature_request',
      'security',
      'performance',
      'integration',
      'documentation',
      'other'
    ],
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open',
    index: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tags: [String],
  attachments: [{
    filename: String,
    url: String,
    size: Number,
    mimeType: String
  }],
  resolvedAt: Date,
  closedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
issueSchema.index({ customer: 1, status: 1 });
issueSchema.index({ status: 1, priority: 1 });
issueSchema.index({ assignedTo: 1, status: 1 });
issueSchema.index({ createdAt: -1 });
issueSchema.index({ category: 1 });

// Static method to get issue stats
issueSchema.statics.getIssueStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    open: stats.find(s => s._id === 'open')?.count || 0,
    in_progress: stats.find(s => s._id === 'in_progress')?.count || 0,
    resolved: stats.find(s => s._id === 'resolved')?.count || 0,
    closed: stats.find(s => s._id === 'closed')?.count || 0
  };
};

module.exports = mongoose.model('Issue', issueSchema);