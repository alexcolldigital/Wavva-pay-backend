const express = require('express');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const {
  getProfile,
  updateProfile,
  uploadProfilePicture,
  deleteProfilePicture,
  lookupUser,
  searchUsers,
  checkUsername,
  setUsername,
  addFriend,
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
} = require('../controllers/usersController');

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

// Profile management routes
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.post('/upload-profile-picture', authMiddleware, upload.single('image'), uploadProfilePicture);
router.delete('/profile-picture', authMiddleware, deleteProfilePicture);

// User lookup and search routes
router.get('/lookup/:identifier', authMiddleware, lookupUser);
router.get('/search', authMiddleware, searchUsers);

// Username management routes
router.post('/check-username', authMiddleware, checkUsername);
router.post('/set-username', authMiddleware, setUsername);

// Friends management routes
router.post('/friends/add', authMiddleware, addFriend);
router.get('/friends', authMiddleware, getFriends);

// Wallet routes
router.get('/wallet', authMiddleware, getWallet);

// Password management routes
router.post('/change-password', authMiddleware, changePassword);

// Notification preferences routes
router.get('/notification-preferences', authMiddleware, getNotificationPreferences);
router.put('/notification-preferences', authMiddleware, updateNotificationPreferences);

// PIN management routes
router.get('/pin-status', authMiddleware, getPinStatus);
router.post('/set-pin', authMiddleware, setPin);
router.post('/verify-pin', authMiddleware, verifyPin);
router.post('/change-pin', authMiddleware, changePin);

// 2FA management routes
router.post('/enable-2fa', authMiddleware, enable2FA);
router.post('/disable-2fa', authMiddleware, disable2FA);

// Device management routes
router.get('/linked-devices', authMiddleware, getLinkedDevices);
router.delete('/linked-devices/:deviceId', authMiddleware, removeLinkedDevice);

module.exports = router;
