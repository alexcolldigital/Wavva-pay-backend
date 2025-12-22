const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User_SQL');

const Combine = sequelize.define('Combine', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
  },
  createdById: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  totalAmount: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    comment: 'Amount in cents',
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'NGN',
  },
  settled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  settledAt: {
    type: DataTypes.DATE,
  },
  status: {
    type: DataTypes.ENUM('active', 'archived'),
    defaultValue: 'active',
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
  tableName: 'combines',
  timestamps: true,
  indexes: [
    { fields: ['createdById'] },
    { fields: ['status'] },
    { fields: ['createdAt'] },
  ],
});

// Associations
Combine.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById', onDelete: 'CASCADE' });
User.hasMany(Combine, { as: 'createdCombines', foreignKey: 'createdById' });

module.exports = Combine;
