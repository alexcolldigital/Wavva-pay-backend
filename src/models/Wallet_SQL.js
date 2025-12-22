const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User_SQL');

const Wallet = sequelize.define('Wallet', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: User,
      key: 'id',
    },
  },
  balance: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    comment: 'Balance in cents',
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'NGN',
  },
  dailyLimit: {
    type: DataTypes.BIGINT,
    defaultValue: 10000 * 100,
    comment: '$10k in cents',
  },
  monthlyLimit: {
    type: DataTypes.BIGINT,
    defaultValue: 100000 * 100,
    comment: '$100k in cents',
  },
  chimoneySubAccountId: {
    type: DataTypes.STRING(255),
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
  tableName: 'wallets',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['createdAt'] },
  ],
});

// Association
Wallet.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasOne(Wallet, { foreignKey: 'userId' });

module.exports = Wallet;
