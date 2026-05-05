const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const logger = require('./logger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} fileName - Original file name
 * @param {string} folder - Cloudinary folder path (e.g., 'wavvapay/kyc/documents')
 * @param {Object} options - Additional Cloudinary upload options
 * @returns {Promise<{public_id: string, secure_url: string, url: string}>}
 */
const uploadToCloudinary = async (fileBuffer, fileName, folder = 'wavvapay', options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: folder,
        public_id: fileName.split('.')[0], // Remove extension
        overwrite: true,
        ...options,
      },
      (error, result) => {
        if (error) {
          logger.error('Cloudinary upload error:', error);
          reject(new Error(`File upload failed: ${error.message}`));
        } else {
          resolve({
            public_id: result.public_id,
            secure_url: result.secure_url,
            url: result.url,
          });
        }
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - The public ID of the file to delete
 * @returns {Promise<Object>}
 */
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info('File deleted from Cloudinary:', publicId);
    return result;
  } catch (error) {
    logger.error('Cloudinary delete error:', error);
    throw new Error(`File deletion failed: ${error.message}`);
  }
};

/**
 * Upload document for KYC verification
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} documentType - Type of document (e.g., 'id_document', 'selfie', 'proof_of_address')
 * @param {string} userId - User ID for organizing uploads
 * @returns {Promise<{public_id: string, secure_url: string, url: string}>}
 */
const uploadKYCDocument = async (fileBuffer, documentType, userId) => {
  const fileName = `${documentType}_${userId}_${Date.now()}`;
  return uploadToCloudinary(fileBuffer, fileName, 'wavvapay/kyc/documents', {
    tags: ['kyc', documentType, userId],
  });
};

/**
 * Validate file size (max 5MB)
 * @param {Buffer} fileBuffer - The file buffer to validate
 * @param {number} maxSizeMB - Maximum file size in MB (default: 5)
 * @returns {boolean}
 */
const validateFileSize = (fileBuffer, maxSizeMB = 5) => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return fileBuffer.length <= maxSizeBytes;
};

/**
 * Validate file type
 * @param {string} mimeType - The MIME type of the file
 * @param {Array<string>} allowedTypes - List of allowed MIME types (default: image types)
 * @returns {boolean}
 */
const validateFileType = (
  mimeType,
  allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
) => {
  return allowedTypes.includes(mimeType);
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  uploadKYCDocument,
  validateFileSize,
  validateFileType,
};
