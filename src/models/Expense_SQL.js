const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User_SQL');
const Combine = require('./Combine_SQL');

const Expense = sequelize.define('Expense', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  combineId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Combine,
      key: 'id',
    },
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: false,
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
  paidById: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  splitAmount: {
    type: DataTypes.BIGINT,
    comment: 'Per person amount in cents',
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
  tableName: 'expenses',
  timestamps: true,
  indexes: [
    { fields: ['combineId'] },
    { fields: ['paidById'] },
    { fields: ['createdAt'] },
  ],
});

// Associations
Expense.belongsTo(Combine, { foreignKey: 'combineId', onDelete: 'CASCADE' });
Expense.belongsTo(User, { as: 'paidBy', foreignKey: 'paidById', onDelete: 'CASCADE' });
Combine.hasMany(Expense, { foreignKey: 'combineId' });
User.hasMany(Expense, { as: 'expensesPaid', foreignKey: 'paidById' });

module.exports = Expense;
