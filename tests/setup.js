require('dotenv').config({ path: '.env.test' });

process.env.MONGODB_TEST_URI = 'mongodb://localhost:27017/wavva_test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.NODE_ENV = 'test';

beforeAll(() => {
  jest.setTimeout(30000);
});

afterAll(async () => {
  if (global.gc) {
    global.gc();
  }
});