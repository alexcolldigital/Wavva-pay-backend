require('dotenv').config({ path: '.env.test' });

// Use test database — must be set before server loads
process.env.MONGODB_URI = 'mongodb://localhost:27017/wavva_pay_test';
process.env.MONGODB_TEST_URI = 'mongodb://localhost:27017/wavva_pay_test';
process.env.JWT_SECRET = 'test_jwt_secret_minimum_32_characters_long';
process.env.NODE_ENV = 'test';
process.env.PORT = '4001'; // avoid conflict with dev server

beforeAll(() => {
  jest.setTimeout(30000);
});

afterAll(async () => {
  if (global.gc) {
    global.gc();
  }
});