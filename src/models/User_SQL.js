const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  firstName: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  lastName: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(255),
    unique: true,
    sparse: true,
    validate: {
      isEmail: true,
    },
  },
  phone: {
    type: DataTypes.STRING(20),
    unique: true,
    sparse: true,
  },
  username: {
    type: DataTypes.STRING(20),
    unique: true,
    sparse: true,
    lowercase: true,
    validate: {
      len: [3, 20],
    },
  },
  userId: {
    type: DataTypes.STRING(50),
    unique: true,
    sparse: true,
    comment: 'Generated unique ID (e.g., @user_12345)',
  },
  passwordHash: {
    type: DataTypes.STRING(255),
  },
  googleId: {
    type: DataTypes.STRING(255),
    unique: true,
    sparse: true,
  },
  profilePicture: {
    type: DataTypes.TEXT,
  },
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  emailVerificationCode: {
    type: DataTypes.STRING(10),
  },
  emailVerificationCodeExpires: {
    type: DataTypes.DATE,
  },
  phoneVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  phoneVerificationOTP: {
    type: DataTypes.STRING(6),
  },
  phoneVerificationExpires: {
    type: DataTypes.DATE,
  },
  kycVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'KYC verification status',
  },
  kycIdType: {
    type: DataTypes.STRING(50),
    comment: 'passport, license, etc.',
  },
  kycIdNumber: {
    type: DataTypes.STRING(100),
  },
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  accountStatus: {
    type: DataTypes.ENUM('active', 'suspended', 'deleted'),
    defaultValue: 'active',
  },
  suspendedReason: {
    type: DataTypes.TEXT,
  },
  suspendedAt: {
    type: DataTypes.DATE,
  },
  qrCodeData: {
    type: DataTypes.TEXT,
    comment: 'Unique identifier for QR scanning',
  },
  nfcTag: {
    type: DataTypes.STRING(255),
  },
  lastLogin: {
    type: DataTypes.DATE,
  },
  lastPasswordChange: {
    type: DataTypes.DATE,
  },
  twoFactorEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  twoFactorSecret: {
    type: DataTypes.TEXT,
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
  tableName: 'users',
  timestamps: true,
  indexes: [
    { fields: ['email'] },
    { fields: ['phone'] },
    { fields: ['username'] },
    { fields: ['userId'] },
    { fields: ['createdAt'] },
  ],
});

module.exports = User;
