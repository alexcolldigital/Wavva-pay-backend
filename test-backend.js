const axios = require('axios');

const API_URL = 'http://localhost:4000/api';
let authToken = '';
let userId = '';

// Test results tracker
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function logTest(name, passed, message = '') {
    results.tests.push({ name, passed, message });
    if (passed) {
        results.passed++;
        console.log(`✅ ${name}`);
    } else {
        results.failed++;
        console.log(`❌ ${name}: ${message}`);
    }
}

async function testAuthentication() {
    console.log('\n🔐 Testing Authentication...\n');
    
    // Test Registration
    try {
        const registerData = {
            email: `test${Date.now()}@example.com`,
            password: 'Test123!',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+2348012345678'
        };
        
        const response = await axios.post(`${API_URL}/auth/register`, registerData);
        authToken = response.data.token;
        userId = response.data.user.id;
        logTest('User Registration', response.status === 201);
    } catch (error) {
        logTest('User Registration', false, error.response?.data?.error || error.message);
    }
    
    // Test Login
    try {
        const loginData = {
            email: 'test@example.com',
            password: 'Test123!'
        };
        
        const response = await axios.post(`${API_URL}/auth/login`, loginData);
        logTest('User Login', response.status === 200);
    } catch (error) {
        logTest('User Login', false, error.response?.data?.error || error.message);
    }
}

async function testBillPayments() {
    console.log('\n💡 Testing Bill Payments...\n');
    
    const headers = { Authorization: `Bearer ${authToken}` };
    
    // Test Airtime Purchase
    try {
        const response = await axios.post(`${API_URL}/bills/airtime`, {
            phone: '+2348012345678',
            amount: 100,
            network: 'MTN'
        }, { headers });
        logTest('Airtime Purchase', response.status === 200);
    } catch (error) {
        logTest('Airtime Purchase', false, error.response?.data?.error || error.message);
    }
    
    // Test Data Purchase
    try {
        const response = await axios.post(`${API_URL}/bills/data`, {
            phone: '+2348012345678',
            amount: 500,
            network: 'GLO',
            plan: '1GB'
        }, { headers });
        logTest('Data Purchase', response.status === 200);
    } catch (error) {
        logTest('Data Purchase', false, error.response?.data?.error || error.message);
    }
    
    // Test Electricity Payment
    try {
        const response = await axios.post(`${API_URL}/bills/electricity`, {
            meterNumber: '12345678901',
            amount: 5000,
            disco: 'EKEDC',
            meterType: 'PREPAID'
        }, { headers });
        logTest('Electricity Payment', response.status === 200);
    } catch (error) {
        logTest('Electricity Payment', false, error.response?.data?.error || error.message);
    }
    
    // Test Cable TV Payment
    try {
        const response = await axios.post(`${API_URL}/bills/cable`, {
            smartCardNumber: '1234567890',
            amount: 3500,
            provider: 'DSTV',
            package: 'COMPACT'
        }, { headers });
        logTest('Cable TV Payment', response.status === 200);
    } catch (error) {
        logTest('Cable TV Payment', false, error.response?.data?.error || error.message);
    }
}

async function testRideHailing() {
    console.log('\n🚗 Testing Ride Hailing...\n');
    
    const headers = { Authorization: `Bearer ${authToken}` };
    
    // Test Ride Request
    try {
        const response = await axios.post(`${API_URL}/rides/request`, {
            rideType: 'BIKE',
            pickup: {
                address: 'Lekki Phase 1',
                latitude: 6.4474,
                longitude: 3.4700
            },
            destination: {
                address: 'Victoria Island',
                latitude: 6.4281,
                longitude: 3.4219
            },
            paymentMethod: 'WALLET'
        }, { headers });
        logTest('Ride Request', response.status === 200);
    } catch (error) {
        logTest('Ride Request', false, error.response?.data?.error || error.message);
    }
}

async function testFoodDelivery() {
    console.log('\n🍔 Testing Food Delivery...\n');
    
    const headers = { Authorization: `Bearer ${authToken}` };
    
    // Test Get Restaurants
    try {
        const response = await axios.get(`${API_URL}/food/restaurants`, { headers });
        logTest('Get Restaurants', response.status === 200);
    } catch (error) {
        logTest('Get Restaurants', false, error.response?.data?.error || error.message);
    }
}

async function testSavings() {
    console.log('\n🎯 Testing Savings & Investments...\n');
    
    const headers = { Authorization: `Bearer ${authToken}` };
    
    // Test Create Savings
    try {
        const response = await axios.post(`${API_URL}/savings/savings`, {
            type: 'FIXED',
            name: 'Emergency Fund',
            targetAmount: 100000,
            maturityDate: '2025-12-31'
        }, { headers });
        logTest('Create Savings Plan', response.status === 200);
    } catch (error) {
        logTest('Create Savings Plan', false, error.response?.data?.error || error.message);
    }
    
    // Test Loan Application
    try {
        const response = await axios.post(`${API_URL}/savings/loans/apply`, {
            amount: 50000,
            duration: 6,
            purpose: 'Business expansion'
        }, { headers });
        logTest('Loan Application', response.status === 200);
    } catch (error) {
        logTest('Loan Application', false, error.response?.data?.error || error.message);
    }
    
    // Test Investment
    try {
        const response = await axios.post(`${API_URL}/savings/investments`, {
            plan: 'TREASURY_BILLS',
            amount: 100000,
            duration: 12
        }, { headers });
        logTest('Create Investment', response.status === 200);
    } catch (error) {
        logTest('Create Investment', false, error.response?.data?.error || error.message);
    }
}

async function testAgentBanking() {
    console.log('\n🏪 Testing Agent Banking...\n');
    
    const headers = { Authorization: `Bearer ${authToken}` };
    
    // Test Agent Registration
    try {
        const response = await axios.post(`${API_URL}/agents/register`, {
            businessName: 'Test Store',
            businessAddress: '123 Test Street, Lagos',
            location: {
                latitude: 6.5244,
                longitude: 3.3792
            }
        }, { headers });
        logTest('Agent Registration', response.status === 200);
    } catch (error) {
        logTest('Agent Registration', false, error.response?.data?.error || error.message);
    }
    
    // Test Find Nearby Agents
    try {
        const response = await axios.get(`${API_URL}/agents/nearby?latitude=6.5244&longitude=3.3792&radius=5`, { headers });
        logTest('Find Nearby Agents', response.status === 200);
    } catch (error) {
        logTest('Find Nearby Agents', false, error.response?.data?.error || error.message);
    }
}

async function testWallets() {
    console.log('\n💰 Testing Wallet Management...\n');
    
    const headers = { Authorization: `Bearer ${authToken}` };
    
    // Test Get Wallet
    try {
        const response = await axios.get(`${API_URL}/wallets`, { headers });
        logTest('Get Wallet Balance', response.status === 200);
    } catch (error) {
        logTest('Get Wallet Balance', false, error.response?.data?.error || error.message);
    }
    
    // Test Wallet Analytics
    try {
        const response = await axios.get(`${API_URL}/wallets/analytics`, { headers });
        logTest('Get Wallet Analytics', response.status === 200);
    } catch (error) {
        logTest('Get Wallet Analytics', false, error.response?.data?.error || error.message);
    }
}

async function testTransactions() {
    console.log('\n📊 Testing Transactions...\n');
    
    const headers = { Authorization: `Bearer ${authToken}` };
    
    // Test Get Transactions
    try {
        const response = await axios.get(`${API_URL}/transactions`, { headers });
        logTest('Get Transaction History', response.status === 200);
    } catch (error) {
        logTest('Get Transaction History', false, error.response?.data?.error || error.message);
    }
    
    // Test Transaction Summary
    try {
        const response = await axios.get(`${API_URL}/transactions/summary/stats`, { headers });
        logTest('Get Transaction Summary', response.status === 200);
    } catch (error) {
        logTest('Get Transaction Summary', false, error.response?.data?.error || error.message);
    }
}

async function testHealthCheck() {
    console.log('\n🏥 Testing Health Check...\n');
    
    try {
        const response = await axios.get('http://localhost:4000/health');
        logTest('Health Check', response.status === 200);
    } catch (error) {
        logTest('Health Check', false, error.message);
    }
    
    try {
        const response = await axios.get('http://localhost:4000/api/test');
        logTest('API Test Endpoint', response.status === 200);
    } catch (error) {
        logTest('API Test Endpoint', false, error.message);
    }
}

async function runAllTests() {
    console.log('🚀 Starting Wavva Pay Backend Tests...\n');
    console.log('=' .repeat(50));
    
    await testHealthCheck();
    await testAuthentication();
    
    if (authToken) {
        await testWallets();
        await testTransactions();
        await testBillPayments();
        await testRideHailing();
        await testFoodDelivery();
        await testSavings();
        await testAgentBanking();
    } else {
        console.log('\n⚠️  Skipping authenticated tests - no auth token\n');
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('\n📊 Test Results Summary:\n');
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📝 Total: ${results.tests.length}`);
    console.log(`📈 Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(2)}%`);
    
    if (results.failed > 0) {
        console.log('\n❌ Failed Tests:');
        results.tests.filter(t => !t.passed).forEach(t => {
            console.log(`   - ${t.name}: ${t.message}`);
        });
    }
    
    console.log('\n' + '='.repeat(50));
}

// Run tests
runAllTests().catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
});