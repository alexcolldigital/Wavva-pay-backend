const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const cloudinaryService = {
  /**
   * Upload profile picture to Cloudinary
   * @param {Buffer} fileBuffer - The file buffer from multer
   * @param {string} userId - User ID for organizing uploads
   * @param {string} originalFilename - Original filename for reference
   * @returns {Promise<Object>} Upload result with secure_url and public_id
   */
  async uploadProfilePicture(fileBuffer, userId, originalFilename = 'profile') {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'wavva-pay/profiles',
          resource_type: 'auto',
          public_id: `${userId}_${Date.now()}`,
          quality: 'auto',
          fetch_format: 'auto',
          width: 500,
          height: 500,
          crop: 'fill',
          gravity: 'face',
          tags: ['profile-picture', userId],
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              secure_url: result.secure_url,
              public_id: result.public_id,
              width: result.width,
              height: result.height,
              format: result.format,
              bytes: result.bytes,
            });
          }
        }
      );

      // Stream the buffer to Cloudinary
      streamifier.createReadStream(fileBuffer).pipe(uploadStream);
    });
  },

  /**
   * Delete profile picture from Cloudinary
   * @param {string} publicId - Cloudinary public ID of the image
   * @returns {Promise<Object>} Deletion result
   */
  async deleteProfilePicture(publicId) {
    if (!publicId) {
      throw new Error('Public ID is required for deletion');
    }

    return cloudinary.uploader.destroy(publicId);
  },

  /**
   * Get optimized image URL with transformations
   * @param {string} publicId - Cloudinary public ID
   * @param {Object} options - Transformation options
   * @returns {string} Transformed image URL
   */
  getOptimizedUrl(publicId, options = {}) {
    const defaultOptions = {
      width: 400,
      height: 400,
      crop: 'fill',
      gravity: 'face',
      quality: 'auto',
      fetch_format: 'auto',
    };

    const transformOptions = { ...defaultOptions, ...options };
    return cloudinary.url(publicId, transformOptions);
  },

  /**
   * Get thumbnail URL
   * @param {string} publicId - Cloudinary public ID
   * @returns {string} Thumbnail URL
   */
  getThumbnailUrl(publicId) {
    return this.getOptimizedUrl(publicId, {
      width: 150,
      height: 150,
      crop: 'thumb',
      gravity: 'face',
    });
  },

  /**
   * Upload multiple images in bulk
   * @param {Array<Buffer>} fileBuffers - Array of file buffers
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of upload results
   */
  async uploadMultipleProfilePictures(fileBuffers, userId) {
    const uploadPromises = fileBuffers.map((buffer, index) =>
      this.uploadProfilePicture(buffer, `${userId}_${index}`)
    );

    return Promise.all(uploadPromises);
  },

  /**
   * Check if image exists and is accessible
   * @param {string} publicId - Cloudinary public ID
   * @returns {Promise<boolean>} Whether image exists
   */
  async imageExists(publicId) {
    try {
      const result = await cloudinary.api.resource(publicId);
      return !!result;
    } catch (error) {
      return false;
    }
  },

  /**
   * Update image metadata/tags
   * @param {string} publicId - Cloudinary public ID
   * @param {Array<string>} tags - Tags to add
   * @returns {Promise<Object>} Update result
   */
  async updateImageTags(publicId, tags = []) {
    return cloudinary.uploader.add_tag(tags, publicId);
  },
};

module.exports = cloudinaryService;
