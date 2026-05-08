const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class SmileIdentityService {
  constructor() {
    this.apiKey = process.env.SMILE_IDENTITY_API_KEY;
    this.partnerId = process.env.SMILE_IDENTITY_PARTNER_ID;
    this.baseURL = process.env.SMILE_IDENTITY_BASE_URL;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  generateSignature(timestamp, userId, jobType) {
    const message = `${timestamp}${this.partnerId}${jobType}${userId}`;
    return crypto.createHmac('sha256', this.apiKey).update(message).digest('hex');
  }

  async verifyIdentity(userData) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const jobType = 1; // Enhanced KYC
      const signature = this.generateSignature(timestamp, userData.userId, jobType);

      const payload = {
        source_sdk: 'rest_api',
        source_sdk_version: '1.0.0',
        partner_id: this.partnerId,
        timestamp,
        signature,
        job_type: jobType,
        user_id: userData.userId,
        job_id: `job_${userData.userId}_${timestamp}`,
        partner_params: {
          user_id: userData.userId,
          job_id: `job_${userData.userId}_${timestamp}`,
          job_type: jobType,
        },
        images: [
          {
            image_type_id: 1, // Selfie
            image: userData.selfieImage, // Base64 encoded
          },
          {
            image_type_id: 3, // ID Document
            image: userData.idFrontImage, // Base64 encoded
          },
        ],
        id_info: {
          country: userData.country || 'NG',
          id_type: userData.idType,
          id_number: userData.idNumber,
          first_name: userData.firstName,
          last_name: userData.lastName,
          dob: userData.dateOfBirth,
        },
      };

      const response = await this.client.post('/submit_job', payload);
      
      logger.info('Smile Identity verification initiated', {
        userId: userData.userId,
        jobId: payload.job_id,
      });

      return {
        success: true,
        jobId: payload.job_id,
        status: 'pending',
        data: response.data,
      };
    } catch (error) {
      logger.error('Smile Identity verification failed', {
        userId: userData.userId,
        error: error.response?.data || error.message,
      });
      return {
        success: false,
        error: error.response?.data?.message || 'Identity verification failed',
      };
    }
  }

  async getJobStatus(jobId) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = this.generateSignature(timestamp, jobId, 'job_status');

      const payload = {
        source_sdk: 'rest_api',
        source_sdk_version: '1.0.0',
        partner_id: this.partnerId,
        timestamp,
        signature,
        job_id: jobId,
      };

      const response = await this.client.post('/job_status', payload);
      
      return {
        success: true,
        status: response.data.job_complete ? 'completed' : 'pending',
        result: response.data.result,
        confidence: response.data.confidence,
        data: response.data,
      };
    } catch (error) {
      logger.error('Failed to get job status', {
        jobId,
        error: error.response?.data || error.message,
      });
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get verification status',
      };
    }
  }

  async verifyBVN(bvn, userData) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const jobType = 7; // BVN Verification
      const signature = this.generateSignature(timestamp, userData.userId, jobType);

      const payload = {
        source_sdk: 'rest_api',
        source_sdk_version: '1.0.0',
        partner_id: this.partnerId,
        timestamp,
        signature,
        job_type: jobType,
        user_id: userData.userId,
        job_id: `bvn_${userData.userId}_${timestamp}`,
        id_info: {
          country: 'NG',
          id_type: 'BVN',
          id_number: bvn,
          first_name: userData.firstName,
          last_name: userData.lastName,
          dob: userData.dateOfBirth,
        },
      };

      const response = await this.client.post('/submit_job', payload);
      
      logger.info('BVN verification initiated', {
        userId: userData.userId,
        jobId: payload.job_id,
      });

      return {
        success: true,
        jobId: payload.job_id,
        status: 'pending',
        data: response.data,
      };
    } catch (error) {
      logger.error('BVN verification failed', {
        userId: userData.userId,
        error: error.response?.data || error.message,
      });
      return {
        success: false,
        error: error.response?.data?.message || 'BVN verification failed',
      };
    }
  }
}

module.exports = new SmileIdentityService();