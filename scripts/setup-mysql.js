#!/usr/bin/env node

/**
 * MySQL Database Setup Script
 * 
 * This script helps set up the MySQL database and user for Wavva Pay
 * Run with: node scripts/setup-mysql.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const DEFAULT_HOST = 'localhost';
const DEFAULT_USER = 'root';
const DEFAULT_PASSWORD = '';
const DB_NAME = 'wavva_pay';
const DB_USER = 'wavva_user';
const DB_USER_PASSWORD = 'wavva_secure_password'; // Change this in production!

async function setupDatabase() {
  let connection;
  try {
    console.log('🔧 Setting up MySQL database for Wavva Pay...\n');

    // Connect to MySQL as root
    console.log(`📍 Connecting to MySQL at ${DEFAULT_HOST}...`);
    connection = await mysql.createConnection({
      host: DEFAULT_HOST,
      user: DEFAULT_USER,
      password: DEFAULT_PASSWORD,
    });
    console.log('✅ Connected to MySQL\n');

    // Create database
    console.log(`📚 Creating database '${DB_NAME}'...`);
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log('✅ Database created/verified\n');

    // Create user
    console.log(`👤 Creating database user '${DB_USER}'...`);
    try {
      // Try to drop existing user first
      await connection.query(`DROP USER IF EXISTS '${DB_USER}'@'${DEFAULT_HOST}'`);
    } catch (e) {
      // User might not exist, that's okay
    }
    
    await connection.query(
      `CREATE USER '${DB_USER}'@'${DEFAULT_HOST}' IDENTIFIED BY '${DB_USER_PASSWORD}'`
    );
    console.log('✅ User created\n');

    // Grant privileges
    console.log(`🔐 Granting privileges to '${DB_USER}'...`);
    await connection.query(
      `GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'${DEFAULT_HOST}'`
    );
    await connection.query('FLUSH PRIVILEGES');
    console.log('✅ Privileges granted\n');

    // Display summary
    console.log('✨ Database setup complete!\n');
    console.log('📋 Summary:');
    console.log(`   Database: ${DB_NAME}`);
    console.log(`   Host: ${DEFAULT_HOST}`);
    console.log(`   User: ${DB_USER}`);
    console.log(`   Password: ${DB_USER_PASSWORD}\n`);

    console.log('📝 Update your .env file with:');
    console.log(`   DB_HOST=${DEFAULT_HOST}`);
    console.log(`   DB_PORT=3306`);
    console.log(`   DB_USER=${DB_USER}`);
    console.log(`   DB_PASSWORD=${DB_USER_PASSWORD}`);
    console.log(`   DB_NAME=${DB_NAME}\n`);

    console.log('🚀 Next: Run "npm run dev" to start the server');
    console.log('   The server will automatically create all tables.\n');

  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

setupDatabase();
