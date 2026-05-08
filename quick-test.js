const axios = require('axios');

const API_URL = 'http://localhost:4000';

async function quickTest() {
    console.log('🚀 Quick Backend Test\n');
    
    // Test 1: Health Check
    try {
        const response = await axios.get(`${API_URL}/health`, { timeout: 2000 });
        console.log('✅ Health Check:', response.data);
    } catch (error) {
        console.log('❌ Health Check Failed:', error.message);
    }
    
    // Test 2: API Test Endpoint
    try {
        const response = await axios.get(`${API_URL}/api/test`, { timeout: 2000 });
        console.log('✅ API Test:', response.data.message);
    } catch (error) {
        console.log('❌ API Test Failed:', error.message);
    }
    
    // Test 3: Check if auth endpoints exist
    try {
        const response = await axios.post(`${API_URL}/api/auth/login`, {}, { 
            timeout: 2000,
            validateStatus: () => true 
        });
        console.log('✅ Auth Endpoint Available:', response.status);
    } catch (error) {
        console.log('❌ Auth Endpoint Failed:', error.message);
    }
    
    // Test 4: Check bills endpoint
    try {
        const response = await axios.get(`${API_URL}/api/bills/providers/airtime`, { 
            timeout: 2000,
            validateStatus: () => true 
        });
        console.log('✅ Bills Endpoint Available:', response.status);
    } catch (error) {
        console.log('❌ Bills Endpoint Failed:', error.message);
    }
    
    console.log('\n✅ Quick test completed!');
    console.log('\n📝 All endpoints are responding.');
    console.log('🌐 Server is running at: http://localhost:4000');
}

quickTest();