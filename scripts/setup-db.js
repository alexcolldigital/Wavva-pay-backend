#!/usr/bin/env node
const mongoose = require('mongoose');
const DatabaseSetup = require('../src/config/database');
require('dotenv').config();

async function setupDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wavvapay');
    console.log('Connected to MongoDB');
    
    await DatabaseSetup.createCollections();
    await DatabaseSetup.initialize();
    
    console.log('Database setup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  }
}

setupDatabase();