const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { generateUserId, validateUsername, validatePhone, parseUserIdentifier } = require('../utils/userIdentifier');
const cloudinaryService = require('../services/cloudinary');

// Get user profile
const getProfile = async (req, res) => {
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
};

// Update user profile
const updateProfile = async (req, res) => {
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
};

// Upload profile picture
const uploadProfilePicture = async (req, res) => {
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
};

// Delete profile picture
const deleteProfilePicture = async (req, res) => {
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
};

// Lookup user by username, phone, or userId
const lookupUser = async (req, res) => {
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
};

// Search users by name or identifier
const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const searchQuery = query.toLowerCase();

    // Search by name, username, or userId
    const users = await User.find({
      $or: [
        { firstName: { $regex: searchQuery, $options: 'i' } },
        { lastName: { $regex: searchQuery, $options: 'i' } },
        { username: { $regex: searchQuery, $options: 'i' } },
        { userId: { $regex: searchQuery, $options: 'i' } },
        { phone: { $regex: searchQuery, $options: 'i' } },
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
};

// Check username availability
const checkUsername = async (req, res) => {
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
};

// Set/Update username and userId for user
const setUsername = async (req, res) => {
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
};

// Add friend
// Add friend using identifier (phone, username, email, or userId)
const addFriend = async (req, res) => {
  try {
    const { identifier, friendId } = req.body;

    if (!identifier && !friendId) {
      return res.status(400).json({ error: 'Identifier or friendId is required' });
    }

    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    let friend;
    
    // If friendId is provided directly, use it
    if (friendId) {
      friend = await User.findById(friendId);
    } else {
      // Otherwise, lookup friend by identifier
      const identifierLower = identifier.toLowerCase().trim();
      
      // Try to find by different identifiers
      friend = await User.findOne({
        $or: [
          { _id: identifierLower },
          { phone: identifierLower },
          { email: identifierLower },
          { username: identifierLower },
          { wavvaTag: identifierLower.replace(/^#+/, '') }, // Remove # if present
        ]
      });
    }

    if (!friend) {
      return res.status(404).json({ error: 'Friend not found' });
    }

    if (friend._id.toString() === req.userId) {
      return res.status(400).json({ error: 'Cannot add yourself as friend' });
    }

    if (currentUser.friends.includes(friend._id)) {
      return res.status(400).json({ error: 'Already friends' });
    }

    currentUser.friends.push(friend._id);
    await currentUser.save();

    // Populate friend details before returning
    await currentUser.populate('friends', 'firstName lastName username profilePicture email phone wavvaTag');

    res.json({ 
      success: true,
      message: 'Friend added successfully', 
      friend: {
        _id: friend._id,
        firstName: friend.firstName,
        lastName: friend.lastName,
        username: friend.username,
        email: friend.email,
        phone: friend.phone,
        wavvaTag: friend.wavvaTag,
        profilePicture: friend.profilePicture,
      }
    });
  } catch (err) {
    console.error('Add friend error:', err);
    res.status(500).json({ error: 'Failed to add friend' });
  }
};

// Remove friend
const removeFriend = async (req, res) => {
  try {
    const { friendId } = req.params;

    if (!friendId) {
      return res.status(400).json({ error: 'Friend ID is required' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if friend exists in user's friends list
    if (!user.friends.includes(friendId)) {
      return res.status(400).json({ error: 'Friend not found in your friends list' });
    }

    // Remove friend
    user.friends = user.friends.filter(id => id.toString() !== friendId);
    await user.save();

    res.json({ 
      success: true,
      message: 'Friend removed successfully',
      friendCount: user.friends.length
    });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
};

// Get friends list
const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('friends', 'firstName lastName username profilePicture email phone');

    res.json(user.friends);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
};

// Get wallet info
const getWallet = async (req, res) => {
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
};

// Change password
const changePassword = async (req, res) => {
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
};

// Get notification preferences
const getNotificationPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user.notificationPreferences);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
};

// Update notification preferences
const updateNotificationPreferences = async (req, res) => {
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
};

// Check if user has PIN set
const getPinStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('pin');
    
    res.json({
      isSet: !!user?.pin,
    });
  } catch (err) {
    console.error('PIN status error:', err);
    res.status(500).json({ error: 'Failed to check PIN status' });
  }
};

// Set a new PIN
const setPin = async (req, res) => {
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
};

// Verify PIN
const verifyPin = async (req, res) => {
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
};

// Change PIN
const changePin = async (req, res) => {
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
};

// Enable 2FA
const enable2FA = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.twoFactorEnabled = true;
    await user.save();

    res.json({
      success: true,
      message: '2FA enabled successfully'
    });
  } catch (err) {
    console.error('Enable 2FA error:', err);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
};

// Disable 2FA
const disable2FA = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.twoFactorEnabled = false;
    await user.save();

    res.json({
      success: true,
      message: '2FA disabled successfully'
    });
  } catch (err) {
    console.error('Disable 2FA error:', err);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
};

// Get linked devices
const getLinkedDevices = async (req, res) => {
  try {
    // For now, return mock data. In a real implementation, you'd have a Device model
    const devices = [
      {
        id: '1',
        name: 'iPhone 14 Pro',
        type: 'mobile',
        lastActive: new Date().toISOString(),
        currentDevice: true
      }
    ];

    res.json({
      success: true,
      devices
    });
  } catch (err) {
    console.error('Get linked devices error:', err);
    res.status(500).json({ error: 'Failed to fetch linked devices' });
  }
};

// Get user's Wavva Tag
const getWavvaTag = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('wavvaTag firstName lastName');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      wavvaTag: user.wavvaTag,
    });
  } catch (err) {
    console.error('Get Wavva Tag error:', err);
    res.status(500).json({ error: 'Failed to get Wavva Tag' });
  }
};

// Update user's Wavva Tag
const updateWavvaTag = async (req, res) => {
  try {
    const { wavvaTag } = req.body;

    if (!wavvaTag) {
      return res.status(400).json({ error: 'Wavva Tag is required' });
    }

    // Import validations from wavvaTag utility
    const { validateWavvaTag, isWavvaTagTaken } = require('../utils/wavvaTag');

    const validation = validateWavvaTag(wavvaTag);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }

    // Check if tag is already taken by another user
    const isTaken = await isWavvaTagTaken(User, wavvaTag, req.userId);
    if (isTaken) {
      return res.status(409).json({ error: 'Wavva Tag already taken' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.wavvaTag = wavvaTag.toLowerCase();
    await user.save();

    res.json({
      success: true,
      message: 'Wavva Tag updated successfully',
      wavvaTag: user.wavvaTag,
    });
  } catch (err) {
    console.error('Update Wavva Tag error:', err);
    res.status(500).json({ error: 'Failed to update Wavva Tag' });
  }
};

// Remove linked device
const removeLinkedDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;

    // For now, just return success. In a real implementation, you'd remove from database
    res.json({
      success: true,
      message: 'Device removed successfully'
    });
  } catch (err) {
    console.error('Remove linked device error:', err);
    res.status(500).json({ error: 'Failed to remove device' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadProfilePicture,
  deleteProfilePicture,
  lookupUser,
  searchUsers,
  checkUsername,
  setUsername,
  addFriend,
  removeFriend,
  getFriends,
  getWallet,
  changePassword,
  getNotificationPreferences,
  updateNotificationPreferences,
  getPinStatus,
  setPin,
  verifyPin,
  changePin,
  enable2FA,
  disable2FA,
  getLinkedDevices,
  removeLinkedDevice,
  getWavvaTag,
  updateWavvaTag,
};
