const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User_SQL');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  senderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  receiverId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: User,
      key: 'id',
    },
    comment: 'Optional for wallet funding',
  },
  amount: {
    type: DataTypes.BIGINT,
    allowNull: false,
    comment: 'Amount in cents',
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'NGN',
  },
  type: {
    type: DataTypes.ENUM('peer-to-peer', 'combine-split', 'payout', 'wallet_funding'),
    allowNull: false,
  },
  chimonyTransactionId: {
    type: DataTypes.STRING(255),
  },
  chimonyStatus: {
    type: DataTypes.STRING(50),
    defaultValue: 'pending',
  },
  flutterwaveTransactionId: {
    type: DataTypes.STRING(255),
  },
  flutterwaveReference: {
    type: DataTypes.STRING(255),
  },
  description: {
    type: DataTypes.TEXT,
  },
  combineId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
    defaultValue: 'pending',
  },
  method: {
    type: DataTypes.STRING(50),
    comment: 'bank_transfer, mobile_money, flutterwave, internal, etc.',
  },
  metadata: {
    type: DataTypes.JSON,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'transactions',
  timestamps: true,
  indexes: [
    { fields: ['senderId'] },
    { fields: ['receiverId'] },
    { fields: ['type'] },
    { fields: ['status'] },
    { fields: ['createdAt'] },
    { fields: ['combineId'] },
  ],
});

// Associations
Transaction.belongsTo(User, { as: 'sender', foreignKey: 'senderId', onDelete: 'CASCADE' });
Transaction.belongsTo(User, { as: 'receiver', foreignKey: 'receiverId', onDelete: 'SET NULL' });
User.hasMany(Transaction, { as: 'sentTransactions', foreignKey: 'senderId' });
User.hasMany(Transaction, { as: 'receivedTransactions', foreignKey: 'receiverId' });

module.exports = Transaction;
