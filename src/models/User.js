const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const security = require('../utils/security');

const userSchema = new mongoose.Schema({
  firstName: { 
    type: String, 
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: { 
    type: String, 
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: { 
    type: String, 
    unique: true, 
    sparse: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Invalid email format'
    }
  },
  phone: { 
    type: String, 
    unique: true, 
    sparse: true,
    validate: {
      validator: function(phone) {
        return security.validateNigerianPhone(phone);
      },
      message: 'Invalid Nigerian phone number format'
    }
  },
  
  // Unique identifiers for P2P transfers
  username: { 
    type: String, 
    unique: true, 
    sparse: true, 
    lowercase: true, 
    trim: true, 
    minlength: [3, 'Username must be at least 3 characters'], 
    maxlength: [20, 'Username cannot exceed 20 characters'],
    validate: {
      validator: function(username) {
        return /^[a-zA-Z0-9_]+$/.test(username);
      },
      message: 'Username can only contain letters, numbers, and underscores'
    }
  },
  userId: { type: String, unique: true, sparse: true }, // Generated unique ID (e.g., @user_12345)
  
  passwordHash: {
    type: String,
    required: function() {
      return !this.googleId; // Password required if not Google OAuth
    }
  },
  googleId: { type: String, unique: true, sparse: true },
  profilePicture: String,
  profilePicturePublicId: String, // Cloudinary public ID for easy deletion

  // Verification
  emailVerified: { type: Boolean, default: false },
  emailVerificationCode: String,
  emailVerificationCodeExpires: Date,
  phoneVerified: { type: Boolean, default: false },
  phoneVerificationOTP: String,
  phoneVerificationExpires: Date,
  
  // KYC (enhanced for CBN compliance)
  kyc: {
    verified: { type: Boolean, default: false },
    verifiedAt: Date,
    tier: { type: Number, enum: [1, 2, 3], default: 1 }, // CBN KYC tiers
    idType: { 
      type: String, 
      enum: ['passport', 'drivers_license', 'voters_card', 'nin'],
      required: function() { return this.kyc.verified; }
    },
    idNumber: {
      type: String,
      required: function() { return this.kyc.verified; }
    },
    bvn: {
      type: String,
      validate: {
        validator: function(bvn) {
          return !bvn || security.validateBVN(bvn);
        },
        message: 'Invalid BVN format'
      }
    },
    bvnVerified: { type: Boolean, default: false },
    bvnJobId: String,
    nin: {
      type: String,
      validate: {
        validator: function(nin) {
          return !nin || security.validateNIN(nin);
        },
        message: 'Invalid NIN format'
      }
    },
    ninVerified: { type: Boolean, default: false },
    address: {
      street: String,
      city: String,
      state: String,
      country: { type: String, default: 'Nigeria' },
      postalCode: String
    },
    dateOfBirth: Date,
    occupation: String,
    sourceOfIncome: String,
    monthlyIncome: Number,
    documentsUploaded: [{
      type: String,
      url: String,
      uploadedAt: { type: Date, default: Date.now }
    }]
  },
  
  // AML Risk Assessment
  riskProfile: {
    score: { type: Number, min: 0, max: 100, default: 0 },
    level: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    lastAssessed: Date,
    factors: [String] // Risk factors identified
  },
  
  // Admin & Account Status
  isAdmin: { type: Boolean, default: false },
  accountStatus: { 
    type: String, 
    enum: ['active', 'suspended', 'frozen', 'closed'], 
    default: 'active' 
  },
  suspendedReason: String,
  suspendedAt: Date,
  suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Transaction Limits (CBN compliance)
  transactionLimits: {
    daily: { type: Number, default: 100000 }, // ₦100,000 for Tier 1
    monthly: { type: Number, default: 300000 }, // ₦300,000 for Tier 1
    single: { type: Number, default: 50000 } // ₦50,000 for Tier 1
  },
  
  // Wallet reference
  walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
  
  // QR Code data
  qrCodeData: String, // Unique identifier for QR scanning
  
  // NFC
  nfcTag: String,
  
  // Friends list
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Preferences
  preferredCurrency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  notificationPreferences: {
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    transactionAlerts: { type: Boolean, default: true },
    securityAlerts: { type: Boolean, default: true }
  },
  
  // Security - 4-digit PIN for transactions
  pin: String,
  pinAttempts: { type: Number, default: 0, max: 5 },
  pinLockedUntil: Date,
  
  // Security tracking
  lastLogin: Date,
  lastLoginIP: String,
  loginAttempts: { type: Number, default: 0, max: 5 },
  accountLockedUntil: Date,
  
  // Compliance flags
  sanctionsScreened: { type: Boolean, default: false },
  sanctionsScreenedAt: Date,
  pep: { type: Boolean, default: false }, // Politically Exposed Person
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { 
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.passwordHash;
      delete ret.pin;
      delete ret.emailVerificationCode;
      delete ret.phoneVerificationOTP;
      return ret;
    }
  }
});

// Indexes for performance and uniqueness
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ username: 1 }, { unique: true, sparse: true });
userSchema.index({ userId: 1 }, { unique: true, sparse: true });
userSchema.index({ 'kyc.bvn': 1 }, { sparse: true });
userSchema.index({ 'kyc.nin': 1 }, { sparse: true });
userSchema.index({ accountStatus: 1 });
userSchema.index({ createdAt: -1 });

// Hash password and PIN before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash') && !this.isModified('pin')) return next();
  
  if (this.isModified('passwordHash') && this.passwordHash) {
    this.passwordHash = await security.hash(this.passwordHash);
  }
  
  if (this.isModified('pin') && this.pin) {
    this.pin = await security.hash(this.pin);
  }
  
  // Update transaction limits based on KYC tier
  if (this.isModified('kyc.tier')) {
    switch (this.kyc.tier) {
      case 1:
        this.transactionLimits = { daily: 100000, monthly: 300000, single: 50000 };
        break;
      case 2:
        this.transactionLimits = { daily: 500000, monthly: 1500000, single: 200000 };
        break;
      case 3:
        this.transactionLimits = { daily: 2000000, monthly: 6000000, single: 1000000 };
        break;
    }
  }
  
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(password) {
  if (!this.passwordHash) return false;
  return security.verifyHash(password, this.passwordHash);
};

// Compare PIN method
userSchema.methods.comparePin = async function(pin) {
  if (!this.pin) return false;
  return security.verifyHash(pin, this.pin);
};

// Check if account is locked
userSchema.methods.isAccountLocked = function() {
  return this.accountLockedUntil && this.accountLockedUntil > Date.now();
};

// Check if PIN is locked
userSchema.methods.isPinLocked = function() {
  return this.pinLockedUntil && this.pinLockedUntil > Date.now();
};

// Increment login attempts
userSchema.methods.incrementLoginAttempts = function() {
  this.loginAttempts += 1;
  if (this.loginAttempts >= 5) {
    this.accountLockedUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
  }
  return this.save();
};

// Reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  this.loginAttempts = 0;
  this.accountLockedUntil = undefined;
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
