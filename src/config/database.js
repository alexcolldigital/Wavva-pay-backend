const mongoose = require('mongoose');

class DatabaseSetup {
  static async initialize() {
    try {
      // User collection indexes
      await mongoose.connection.db.collection('users').createIndexes([
        { key: { email: 1 }, unique: true },
        { key: { phone: 1 }, unique: true },
        { key: { bvn: 1 }, sparse: true },
        { key: { nin: 1 }, sparse: true },
        { key: { kycTier: 1 } },
        { key: { riskScore: 1 } },
        { key: { createdAt: 1 } }
      ]);

      // Transaction collection indexes
      await mongoose.connection.db.collection('transactions').createIndexes([
        { key: { userId: 1, createdAt: -1 } },
        { key: { amount: 1 } },
        { key: { status: 1 } },
        { key: { type: 1 } },
        { key: { complianceFlags: 1 } },
        { key: { createdAt: 1 }, expireAfterSeconds: 2592000 } // 30 days TTL for logs
      ]);

      // Compliance logs indexes
      await mongoose.connection.db.collection('compliance_logs').createIndexes([
        { key: { userId: 1, timestamp: -1 } },
        { key: { riskScore: 1 } },
        { key: { flagType: 1 } },
        { key: { timestamp: 1 }, expireAfterSeconds: 7776000 } // 90 days retention
      ]);

      console.log('Database indexes created successfully');
    } catch (error) {
      console.error('Database setup error:', error);
      throw error;
    }
  }

  static async createCollections() {
    const collections = ['users', 'transactions', 'compliance_logs', 'audit_trails'];
    
    for (const collection of collections) {
      try {
        await mongoose.connection.db.createCollection(collection);
        console.log(`Collection ${collection} created`);
      } catch (error) {
        if (error.code !== 48) { // Collection already exists
          throw error;
        }
      }
    }
  }
}

module.exports = DatabaseSetup;