const mongoose = require('mongoose');

const auditTrailSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  category: { 
    type: String, 
    required: true,
    enum: ['authentication', 'kyc', 'transaction', 'compliance', 'admin', 'security']
  },
  details: {
    description: { type: String, required: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    location: {
      country: String,
      city: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  result: {
    status: { type: String, enum: ['success', 'failure', 'pending'], required: true },
    message: String,
    errorCode: String
  },
  riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
  complianceFlags: [{
    flag: String,
    severity: { type: String, enum: ['info', 'warning', 'critical'] },
    description: String
  }],
  hash: { type: String, required: true }, // For integrity verification
  timestamp: { type: Date, default: Date.now, required: true }
}, { 
  timestamps: true,
  collection: 'audit_trails'
});

// Indexes for efficient querying
auditTrailSchema.index({ userId: 1, timestamp: -1 });
auditTrailSchema.index({ category: 1, timestamp: -1 });
auditTrailSchema.index({ riskLevel: 1, timestamp: -1 });
auditTrailSchema.index({ 'result.status': 1, timestamp: -1 });

module.exports = mongoose.model('AuditTrail', auditTrailSchema);