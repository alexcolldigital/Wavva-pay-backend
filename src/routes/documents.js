const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const logger = require('../utils/logger');
const { uploadKYCDocument, validateFileSize, validateFileType } = require('../utils/fileUpload');

const router = express.Router();

// Configure multer for file uploads (keep in memory)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (validateFileType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
  },
});

/**
 * Upload KYC document
 * POST /documents/kyc
 * Required: file, documentType (id_document, selfie, proof_of_address)
 */
router.post('/kyc', auth, upload.single('file'), async (req, res) => {
  try {
    const { documentType } = req.body;

    // Validate document type
    const validDocumentTypes = ['id_document', 'selfie', 'proof_of_address'];
    if (!documentType || !validDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid document type. Must be one of: ${validDocumentTypes.join(', ')}`,
      });
    }

    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided',
      });
    }

    // Validate file size
    if (!validateFileSize(req.file.buffer)) {
      return res.status(400).json({
        success: false,
        error: 'File size exceeds 5MB limit',
      });
    }

    // Upload to Cloudinary
    const result = await uploadKYCDocument(
      req.file.buffer,
      documentType,
      req.user.id
    );

    logger.info(`KYC document uploaded for user ${req.user.id}: ${documentType}`);

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        url: result.secure_url,
        publicId: result.public_id,
      },
    });
  } catch (err) {
    logger.error('Document upload error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to upload document',
    });
  }
});

/**
 * Upload profile picture
 * POST /documents/profile-picture
 * Required: file
 */
router.post('/profile-picture', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided',
      });
    }

    // Validate file size
    if (!validateFileSize(req.file.buffer, 2)) { // 2MB for profile pictures
      return res.status(400).json({
        success: false,
        error: 'File size exceeds 2MB limit',
      });
    }

    // Upload to Cloudinary
    const result = await uploadKYCDocument(
      req.file.buffer,
      'profile_picture',
      req.user.id
    );

    logger.info(`Profile picture uploaded for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Profile picture uploaded successfully',
      data: {
        url: result.secure_url,
        publicId: result.public_id,
      },
    });
  } catch (err) {
    logger.error('Profile picture upload error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to upload profile picture',
    });
  }
});

module.exports = router;
