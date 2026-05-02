const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { generateUserId, validateUsername, validatePhone, parseUserIdentifier } = require('../utils/userIdentifier');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinaryService = require('../services/cloudinary');
const router = express.Router();

// Configure multer for memory storage (will upload to Cloudinary directly)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, GIF, and WebP are allowed.'));
    }
  },
});

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-passwordHash -emailVerificationToken -phoneVerificationOTP')
      .populate('walletId')
      .populate('friends', 'firstName lastName profilePicture email');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, phone, profilePicture, preferredCurrency } = req.body;
    
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone) updateData.phone = phone;
    if (profilePicture) updateData.profilePicture = profilePicture;
    if (preferredCurrency) {
      // Validate preferred currency (only USD and NGN allowed)
      if (!['USD', 'NGN'].includes(preferredCurrency)) {
        return res.status(400).json({ error: 'Invalid currency. Only USD and NGN are supported.' });
      }
      updateData.preferredCurrency = preferredCurrency;
    }
    
    const user = await User.findByIdAndUpdate(
      req.userId,
      updateData,
      { new: true }
    ).select('-passwordHash -emailVerificationToken -phoneVerificationOTP').populate('walletId').populate('friends', 'firstName lastName profilePicture email');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Upload profile picture
router.post('/upload-profile-picture', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Upload to Cloudinary
    const cloudinaryResult = await cloudinaryService.uploadProfilePicture(
      req.file.buffer,
      req.userId,
      req.file.originalname
    );

    // Update user profile with new picture URL
    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        profilePicture: cloudinaryResult.secure_url,
        // Store the public ID for easy deletion later
        profilePicturePublicId: cloudinaryResult.public_id,
      },
      { new: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      url: cloudinaryResult.secure_url,
      publicId: cloudinaryResult.public_id,
      message: 'Profile picture uploaded successfully',
    });
  } catch (err) {
    console.error('Profile picture upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload profile picture' });
  }
});

// Delete profile picture
router.delete('/profile-picture', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user || !user.profilePicture) {
      return res.status(404).json({ error: 'No profile picture to delete' });
    }

    // Delete from Cloudinary if public ID exists
    if (user.profilePicturePublicId) {
      try {
        await cloudinaryService.deleteProfilePicture(user.profilePicturePublicId);
      } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
        // Continue even if Cloudinary deletion fails
      }
    }

    // Remove picture URL from user
    user.profilePicture = null;
    user.profilePicturePublicId = null;
    await user.save();

    res.json({
      success: true,
      message: 'Profile picture deleted successfully',
    });
  } catch (err) {
    console.error('Profile picture delete error:', err);
    res.status(500).json({ error: 'Failed to delete profile picture' });
  }
});

// Lookup user by username, phone, or userId
router.get('/lookup/:identifier', authMiddleware, async (req, res) => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      return res.status(400).json({ error: 'Identifier is required' });
    }

    const parsed = parseUserIdentifier(identifier);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid identifier format' });
    }

    let user;
    if (parsed.type === 'userId') {
      user = await User.findOne({ userId: parsed.value });
    } else if (parsed.type === 'phone') {
      user = await User.findOne({ phone: parsed.value });
    } else {
      user = await User.findOne({ username: parsed.value.toLowerCase() });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't return sensitive information
    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      userId: user.userId,
      profilePicture: user.profilePicture,
      email: user.email,
    });
  } catch (err) {
    console.error('User lookup error:', err);
    res.status(500).json({ error: 'Failed to lookup user' });
  }
});

// Search users by name or identifier
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const searchQuery = query.toLowerCase();

    // Search by name, username, userId, email, or phone
    const users = await User.find({
      $or: [
        { firstName: { $regex: searchQuery, $options: 'i' } },
        { lastName: { $regex: searchQuery, $options: 'i' } },
        { username: { $regex: searchQuery, $options: 'i' } },
        { userId: { $regex: searchQuery, $options: 'i' } },
        { phone: { $regex: searchQuery, $options: 'i' } },
        { email: { $regex: searchQuery, $options: 'i' } },
      ],
      _id: { $ne: req.userId }, // Exclude current user
    })
      .select('firstName lastName username userId profilePicture email phone')
      .limit(10);

    res.json(users);
  } catch (err) {
    console.error('User search error:', err);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Check username availability
router.post('/check-username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!validateUsername(username)) {
      return res.status(400).json({
        error: 'Username must be 3-20 characters, alphanumeric and underscores only',
      });
    }

    const existingUser = await User.findOne({ username: username.toLowerCase() });

    res.json({
      available: !existingUser,
      username: username.toLowerCase(),
    });
  } catch (err) {
    console.error('Username check error:', err);
    res.status(500).json({ error: 'Failed to check username' });
  }
});

// Set/Update username and userId for user
router.post('/set-username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!validateUsername(username)) {
      return res.status(400).json({
        error: 'Username must be 3-20 characters, alphanumeric and underscores only',
      });
    }

    const normalizedUsername = username.toLowerCase();
    const existingUser = await User.findOne({ username: normalizedUsername });

    if (existingUser && existingUser._id.toString() !== req.userId) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate new userId if not set, or regenerate if username changed
    user.username = normalizedUsername;
    user.userId = generateUserId(normalizedUsername);
    await user.save();

    res.json({
      success: true,
      username: user.username,
      userId: user.userId,
      message: 'Username updated successfully',
    });
  } catch (err) {
    console.error('Set username error:', err);
    res.status(500).json({ error: 'Failed to set username' });
  }
});

// Add friend
router.post('/friends/add', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.body;

    if (!friendId || friendId === req.userId) {
      return res.status(400).json({ error: 'Invalid friend ID' });
    }

    const user = await User.findById(req.userId);
    const friend = await User.findById(friendId);

    if (!friend) {
      return res.status(404).json({ error: 'Friend not found' });
    }

    if (user.friends.includes(friendId)) {
      return res.status(400).json({ error: 'Already friends' });
    }

    user.friends.push(friendId);
    await user.save();

    res.json({ message: 'Friend added successfully', friends: user.friends });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add friend' });
  }
});

// Get friends list
router.get('/friends', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('friends', 'firstName lastName username profilePicture email phone');

    res.json(user.friends);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});



// Get wallet info
router.get('/wallet', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('walletId');

    if (!user || !user.walletId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({
      balance: user.walletId.balance / 100, // Convert from cents to dollars
      currency: user.walletId.currency,
      dailyLimit: user.walletId.dailyLimit / 100,
      monthlyLimit: user.walletId.monthlyLimit / 100,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

// Change password
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Get user
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check current password
    const isPasswordCorrect = await user.comparePassword(currentPassword);
    if (!isPasswordCorrect) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    user.passwordHash = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Get notification preferences
router.get('/notification-preferences', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user.notificationPreferences);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

// Update notification preferences
router.put('/notification-preferences', authMiddleware, async (req, res) => {
  try {
    const { emailNotifications, smsNotifications, pushNotifications } = req.body;

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        notificationPreferences: {
          emailNotifications: emailNotifications !== undefined ? emailNotifications : true,
          smsNotifications: smsNotifications !== undefined ? smsNotifications : true,
          pushNotifications: pushNotifications !== undefined ? pushNotifications : true,
        }
      },
      { new: true }
    ).select('-passwordHash');

    res.json(user.notificationPreferences);
  } catch (err) {
    console.error('Update notification preferences error:', err);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

// Check if user has PIN set
router.get('/pin-status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('pin');
    
    res.json({
      isSet: !!user?.pin,
    });
  } catch (err) {
    console.error('PIN status error:', err);
    res.status(500).json({ error: 'Failed to check PIN status' });
  }
});

// Set a new PIN
router.post('/set-pin', authMiddleware, async (req, res) => {
  try {
    const { pin } = req.body;

    // Validation
    if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4 digits' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.pin = pin;
    user.pinAttempts = 0;
    user.pinLockedUntil = null;
    await user.save();

    res.json({
      success: true,
      message: 'PIN set successfully',
      isSet: true,
    });
  } catch (err) {
    console.error('Set PIN error:', err);
    res.status(500).json({ error: 'Failed to set PIN' });
  }
});

// Verify PIN
router.post('/verify-pin', authMiddleware, async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4 digits' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is locked due to too many attempts
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }

    // Check if PIN is set
    if (!user.pin) {
      return res.status(400).json({ error: 'PIN not set. Please set up a PIN first.' });
    }

    // Verify PIN
    const isPinCorrect = await user.comparePin(pin);

    if (!isPinCorrect) {
      user.pinAttempts = (user.pinAttempts || 0) + 1;

      // Lock account after 3 failed attempts for 15 minutes
      if (user.pinAttempts >= 3) {
        user.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await user.save();
      return res.status(401).json({ error: 'Incorrect PIN' });
    }

    // Reset attempts on successful verification
    user.pinAttempts = 0;
    user.pinLockedUntil = null;
    await user.save();

    res.json({
      success: true,
      message: 'PIN verified successfully',
    });
  } catch (err) {
    console.error('Verify PIN error:', err);
    res.status(500).json({ error: 'Failed to verify PIN' });
  }
});

// Change PIN
router.post('/change-pin', authMiddleware, async (req, res) => {
  try {
    const { oldPin, newPin } = req.body;

    if (!oldPin || oldPin.length !== 4 || !/^\d+$/.test(oldPin)) {
      return res.status(400).json({ error: 'Current PIN must be 4 digits' });
    }

    if (!newPin || newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      return res.status(400).json({ error: 'New PIN must be 4 digits' });
    }

    if (oldPin === newPin) {
      return res.status(400).json({ error: 'New PIN must be different from current PIN' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.pin) {
      return res.status(400).json({ error: 'PIN not set. Please set up a PIN first.' });
    }

    // Verify old PIN
    const isOldPinCorrect = await user.comparePin(oldPin);
    if (!isOldPinCorrect) {
      return res.status(401).json({ error: 'Current PIN is incorrect' });
    }

    // Set new PIN
    user.pin = newPin;
    user.pinAttempts = 0;
    user.pinLockedUntil = null;
    await user.save();

    res.json({
      success: true,
      message: 'PIN changed successfully',
    });
  } catch (err) {
    console.error('Change PIN error:', err);
    res.status(500).json({ error: 'Failed to change PIN' });
  }
});

module.exports = router;
