const sequelize = require('../config/database');
const User = require('./User_SQL');
const Wallet = require('./Wallet_SQL');
const Transaction = require('./Transaction_SQL');
const Combine = require('./Combine_SQL');
const Expense = require('./Expense_SQL');

// Import models to register associations
const models = {
  User,
  Wallet,
  Transaction,
  Combine,
  Expense,
  sequelize,
};

// Define association: User has many friends (self-referential many-to-many)
// This would require a junction table in practice, for now we'll skip it
// and handle friends list separately if needed

// Sync all models
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ alter: !force, force });
    console.log('✅ Database synchronized successfully');
  } catch (error) {
    console.error('❌ Error syncing database:', error.message);
    throw error;
  }
};

module.exports = {
  ...models,
  syncDatabase,
};
