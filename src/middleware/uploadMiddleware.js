const multer = require('multer');

// Configure storage (using memory storage for streaming to Cloudinary)
const storage = multer.memoryStorage();

// File filter for documents
const documentFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: PDF, JPG, PNG, WEBP, DOC, DOCX'));
  }
};

// File limits
const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB max file size
};

// Create middleware instances for different file types

// Document upload (single file, 5MB max)
const uploadDocument = multer({
  storage,
  fileFilter: documentFilter,
  limits
}).single('document');

// Profile/logo upload
const uploadProfileImage = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image type. Allowed: JPG, PNG, WEBP'));
    }
  },
  limits: { fileSize: 3 * 1024 * 1024 } // 3MB for images
}).single('image');

module.exports = {
  uploadDocument,
  uploadProfileImage,
};
