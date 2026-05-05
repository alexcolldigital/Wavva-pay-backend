require('dotenv').config();
const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

async function testQRGeneration() {
  try {
    console.log('🔐 Logging in as test user...');

    // Login with test user
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'john@wavvapay.com',
      password: 'password123'
    });

    console.log('Login response:', loginResponse.data);

    if (!loginResponse.data.accessToken) {
      throw new Error('Login failed - no access token');
    }

    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful, token:', token.substring(0, 20) + '...');

    console.log('📱 Generating QR token...');

    // Generate QR token
    const qrResponse = await axios.post(`${API_BASE_URL}/payments/generate-qr-token`, {
      type: 'receive'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ QR Token generated successfully:', qrResponse.data);

  } catch (error) {
    console.error('❌ Error:', error.response ? error.response.data : error.message);
  }
}

testQRGeneration();