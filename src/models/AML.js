const mongoose = require('mongoose');

const amlSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  
  // Alert Information
  alertType: { 
    type: String, 
    required: true,
    enum: [
      'high_value_transaction',
      'unusual_pattern',
      'rapid_succession',
      'round_amount_pattern',
      'cross_border',
      'sanctioned_entity',
      'pep_involvement', // Politically Exposed Person
      'cash_intensive_business'
    ]
  },
  
  // Risk Scoring
  riskScore: { type: Number, required: true, min: 0, max: 100 },
  riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  
  // Transaction Details
  transactionDetails: {
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    type: { type: String, required: true },
    counterparty: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
      accountDetails: String
    }
  },
  
  // Pattern Analysis
  patternAnalysis: {
    frequencyScore: Number, // How often user transacts
    amountVariation: Number, // Variation in transaction amounts
    timePattern: String, // Unusual timing patterns
    geographicRisk: Number, // Geographic risk assessment
    velocityScore: Number // Speed of transactions
  },
  
  // Investigation Status
  status: { 
    type: String, 
    enum: ['open', 'under_investigation', 'cleared', 'escalated', 'reported'], 
    default: 'open' 
  },
  
  // Investigation Details
  investigation: {
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: [{ 
      note: String, 
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      addedAt: { type: Date, default: Date.now }
    }],
    resolution: String,
    resolvedAt: Date,
    escalatedTo: String, // External authority if escalated
    sarFiled: { type: Boolean, default: false }, // Suspicious Activity Report
    sarReference: String
  },
  
  // Automated Actions Taken
  actionsPerformed: [{
    action: { type: String, enum: ['account_freeze', 'transaction_block', 'enhanced_monitoring', 'manual_review'] },
    performedAt: { type: Date, default: Date.now },
    performedBy: String // system or user ID
  }]
}, { timestamps: true });

// Indexes for efficient querying
amlSchema.index({ userId: 1, createdAt: -1 });
amlSchema.index({ riskLevel: 1, status: 1 });
amlSchema.index({ alertType: 1 });
amlSchema.index({ 'transactionDetails.amount': 1 });

module.exports = mongoose.model('AML', amlSchema);