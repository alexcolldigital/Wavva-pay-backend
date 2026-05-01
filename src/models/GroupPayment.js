const mongoose = require('mongoose');

const groupPaymentSchema = new mongoose.Schema({
  // Group Details
  title: { type: String, required: true },
  description: String,
  goal: { type: String, required: true }, // e.g., "Trip Fund", "Gift", "Event"

  // Creator
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Payment Details
  targetAmount: { type: Number, required: true }, // Total amount needed (in cents)
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  currentAmount: { type: Number, default: 0 }, // Amount collected so far (in cents)

  // Group Members
  members: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    },
    contributionType: {
      type: String,
      enum: ['fixed', 'flexible', 'percentage'],
      default: 'flexible'
    },
    fixedAmount: { type: Number }, // For fixed contributions (in cents)
    percentageAmount: { type: Number }, // For percentage contributions
    contributedAmount: { type: Number, default: 0 }, // Amount actually contributed (in cents)
    status: {
      type: String,
      enum: ['pending', 'contributing', 'completed', 'declined'],
      default: 'pending'
    },
    joinedAt: { type: Date, default: Date.now },
    lastContribution: Date,
    _id: false
  }],

  // Group Settings
  contributionType: {
    type: String,
    enum: ['fixed_amount', 'flexible', 'percentage', 'goal_based'],
    default: 'flexible'
  },

  // Timeline
  deadline: Date,
  startDate: { type: Date, default: Date.now },
  endDate: Date,

  // Status
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'cancelled', 'expired'],
    default: 'active'
  },

  // Recurring Settings (for recurring group payments)
  isRecurring: { type: Boolean, default: false },
  recurringInterval: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    default: 'monthly'
  },
  recurringAmount: { type: Number }, // Amount per recurring cycle (in cents)

  // Group Wallet (optional - for storing group funds)
  groupWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },

  // Payment Settings
  autoReminders: { type: Boolean, default: true },
  reminderFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'none'],
    default: 'weekly'
  },

  // Privacy Settings
  isPublic: { type: Boolean, default: false },
  inviteCode: { type: String, unique: true, sparse: true },

  // Communication
  groupChatEnabled: { type: Boolean, default: true },
  messages: [{
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, required: true },
    messageType: {
      type: String,
      enum: ['text', 'payment', 'reminder', 'system'],
      default: 'text'
    },
    createdAt: { type: Date, default: Date.now },
    _id: false
  }],

  // Payment Links & QR
  paymentReference: String,
  paymentLink: String,
  qrCode: String,
  collectionAccount: {
    accountNumber: String,
    accountName: String,
    bankName: String,
    reference: String,
    provider: String
  },

  // Related Transactions
  transactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }],

  // Completion Settings
  completionAction: {
    type: String,
    enum: ['transfer_to_creator', 'transfer_to_group_wallet', 'distribute_equally', 'manual_distribution'],
    default: 'transfer_to_creator'
  },

  // Metadata
  category: {
    type: String,
    enum: ['trip', 'gift', 'event', 'emergency', 'business', 'education', 'other'],
    default: 'other'
  },
  tags: [String],
  location: String,

  // Analytics
  totalContributions: { type: Number, default: 0 },
  totalMembers: { type: Number, default: 0 },
  completionRate: { type: Number, default: 0 }, // Percentage

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  completedAt: Date,
  cancelledAt: Date,

}, { timestamps: true });

// Indexes
groupPaymentSchema.index({ createdBy: 1, createdAt: -1 });
groupPaymentSchema.index({ 'members.userId': 1 });
groupPaymentSchema.index({ status: 1 });
groupPaymentSchema.index({ deadline: 1 });
groupPaymentSchema.index({ inviteCode: 1 });
groupPaymentSchema.index({ isPublic: 1 });

// Pre-save middleware
groupPaymentSchema.pre('save', function(next) {
  // Update total members count
  this.totalMembers = this.members.length;

  // Calculate completion rate
  if (this.targetAmount > 0) {
    this.completionRate = Math.round((this.currentAmount / this.targetAmount) * 100);
  }

  // Generate invite code if not exists and is public
  if (this.isPublic && !this.inviteCode) {
    this.inviteCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Update status based on conditions
  if (this.status === 'active') {
    if (this.currentAmount >= this.targetAmount) {
      this.status = 'completed';
      this.completedAt = new Date();
    } else if (this.deadline && new Date() > this.deadline) {
      this.status = 'expired';
    }
  }

  next();
});

// Virtual for checking if group is full
groupPaymentSchema.virtual('isFull').get(function() {
  return this.currentAmount >= this.targetAmount;
});

// Virtual for days remaining
groupPaymentSchema.virtual('daysRemaining').get(function() {
  if (!this.deadline) return null;
  const now = new Date();
  const deadline = new Date(this.deadline);
  const diffTime = deadline - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Method to add member
groupPaymentSchema.methods.addMember = function(userId, contributionType = 'flexible', fixedAmount = null, percentageAmount = null) {
  const existingMember = this.members.find(member => member.userId.toString() === userId.toString());
  if (existingMember) {
    throw new Error('User is already a member of this group');
  }

  this.members.push({
    userId,
    contributionType,
    fixedAmount,
    percentageAmount,
    status: 'pending'
  });

  return this.save();
};

// Method to remove member
groupPaymentSchema.methods.removeMember = function(userId) {
  this.members = this.members.filter(member => member.userId.toString() !== userId.toString());
  return this.save();
};

// Method to add contribution
groupPaymentSchema.methods.addContribution = function(userId, amount) {
  const member = this.members.find(member => member.userId.toString() === userId.toString());
  if (!member) {
    throw new Error('User is not a member of this group');
  }

  member.contributedAmount += amount;
  member.lastContribution = new Date();
  member.status = 'contributing';

  this.currentAmount += amount;
  this.totalContributions += 1;

  return this.save();
};

// Method to check if user can contribute
groupPaymentSchema.methods.canContribute = function(userId) {
  const member = this.members.find(member => member.userId.toString() === userId.toString());
  if (!member) return false;

  if (this.status !== 'active') return false;

  if (member.contributionType === 'fixed' && member.contributedAmount >= member.fixedAmount) {
    return false;
  }

  return true;
};

// Method to get member contribution summary
groupPaymentSchema.methods.getMemberSummary = function(userId) {
  const member = this.members.find(member => member.userId.toString() === userId.toString());
  if (!member) return null;

  let expectedAmount = 0;
  if (member.contributionType === 'fixed') {
    expectedAmount = member.fixedAmount || 0;
  } else if (member.contributionType === 'percentage') {
    expectedAmount = Math.round((member.percentageAmount / 100) * this.targetAmount);
  }

  return {
    userId: member.userId,
    contributionType: member.contributionType,
    contributedAmount: member.contributedAmount,
    expectedAmount,
    remainingAmount: Math.max(0, expectedAmount - member.contributedAmount),
    status: member.status,
    joinedAt: member.joinedAt
  };
};

module.exports = mongoose.model('GroupPayment', groupPaymentSchema);
