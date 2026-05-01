const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  phone: { type: String, unique: true, sparse: true },
  
  // Unique identifiers for P2P transfers
  username: { type: String, unique: true, sparse: true, lowercase: true, trim: true, minlength: 3, maxlength: 20 },
  userId: { type: String, unique: true, sparse: true }, // Generated unique ID (e.g., @user_12345)
  
  // Wavva Tag - Primary P2P identifier (like CashApp $tag format: #wavvatag)
  wavvaTag: { 
    type: String, 
    unique: true, 
    sparse: true, 
    lowercase: true, 
    trim: true, 
    minlength: 5, 
    maxlength: 15,
    index: true, // Index for fast lookup during payment searches
  },
  
  passwordHash: String,
  googleId: { type: String, unique: true, sparse: true },
  profilePicture: String,
  profilePicturePublicId: String, // Cloudinary public ID for easy deletion

  
  // Verification
  verificationMethod: { type: String, enum: ['email', 'phone'], default: 'email' },
  emailVerified: { type: Boolean, default: false },
  emailVerificationCode: String,
  emailVerificationCodeExpires: Date,
  phoneVerified: { type: Boolean, default: false },
  phoneVerificationOTP: String,
  phoneVerificationExpires: Date,
  verificationCompletedAt: Date,
  
  // BVN / NIN for Flutterwave static virtual account creation
  bvn: String,
  nin: String,

  // KYC (basic)
  kyc: {
    verified: { type: Boolean, default: false },
    idType: String, // passport, license, etc.
    idNumber: String,
  },
  
  // Admin & Account Status
  isAdmin: { type: Boolean, default: false },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  accountStatus: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active' },
  suspendedReason: String,
  suspendedAt: Date,
  
  // Wallet reference
  walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
  
  // Virtual account (Wema ALAT for receiving funds)
  virtualAccount: {
    accountNumber: String,
    accountName: String,
    bankCode: String, // '035' for Wema Bank
    bankName: String,
    status: String, // 'active', 'inactive', 'suspended'
    accountId: String, // Wema account ID
    reference: String, // Wema reference
    createdAt: Date,
  },
  // QR Code data
  qrCodeData: String, // Unique identifier for QR scanning
  
  // NFC
  nfcTag: String,
  
  // Friends list
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Referral system
  referralCode: { type: String, unique: true, sparse: true },
  
  // Preferences
  preferredCurrency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  notificationPreferences: {
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: true },
    paymentReceived: { type: Boolean, default: true },
    paymentSent: { type: Boolean, default: true },
    groupPayments: { type: Boolean, default: true },
    security: { type: Boolean, default: true },
    promotions: { type: Boolean, default: false }
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
    // OPTIMIZATION: Reduced from 10 to 8 rounds for better performance (still secure)
    this.passwordHash = await bcrypt.hash(this.passwordHash, 8);
  }
  
  if (this.isModified('pin') && this.pin) {
    this.pin = await bcrypt.hash(this.pin, 8);
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
