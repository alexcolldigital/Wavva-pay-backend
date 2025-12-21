const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  phone: { type: String, unique: true, sparse: true },
  passwordHash: String,
  googleId: { type: String, unique: true, sparse: true },
  profilePicture: String,
  
  // Verification
  emailVerified: { type: Boolean, default: false },
  phoneVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  phoneVerificationOTP: String,
  phoneVerificationExpires: Date,
  
  // KYC (basic)
  kyc: {
    verified: { type: Boolean, default: false },
    idType: String, // passport, license, etc.
    idNumber: String,
  },
  
  // Admin & Account Status
  isAdmin: { type: Boolean, default: false },
  accountStatus: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
  suspendedReason: String,
  suspendedAt: Date,
  
  // Wallet reference
  walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
  
  // QR Code data
  qrCodeData: String, // Unique identifier for QR scanning
  
  // NFC
  nfcTag: String,
  
  // Friends list
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Preferences
  preferredCurrency: { type: String, default: 'NGN' },
  notificationPreferences: {
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
  },
  
  // Security - 4-digit PIN for transactions
  pin: String,
  pinAttempts: { type: Number, default: 0 },
  pinLockedUntil: Date,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Hash password and PIN before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash') && !this.isModified('pin')) return next();
  
  if (this.isModified('passwordHash')) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  }
  
  if (this.isModified('pin') && this.pin) {
    this.pin = await bcrypt.hash(this.pin, 10);
  }
  
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

// Compare PIN method
userSchema.methods.comparePin = async function(pin) {
  if (!this.pin) return false;
  return bcrypt.compare(pin, this.pin);
};

module.exports = mongoose.model('User', userSchema);
