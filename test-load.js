require('dotenv').config();
const mongoose = require('mongoose');

console.log('Environment loaded');
console.log('MONGODB_URI:', process.env.MONGODB_URI.substring(0, 50) + '...');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    
    // Try requiring the auth routes
    console.log('Loading routes...');
    const authRoutes = require('./src/routes/auth');
    console.log('Auth routes loaded');
    
    console.log('All modules loaded successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
