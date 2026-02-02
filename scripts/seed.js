require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const Wallet = require('../src/models/Wallet');
const Transaction = require('../src/models/Transaction');
const Combine = require('../src/models/Combine');
const Expense = require('../src/models/Expense');
const logger = require('../src/utils/logger');

const seed = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    // Clear existing data
    await User.deleteMany({});
    await Wallet.deleteMany({});
    await Transaction.deleteMany({});
    await Combine.deleteMany({});
    await Expense.deleteMany({});

    logger.info('Creating seed data...');

    // Hash password
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Create test users
    const users = [
      {
        firstName: 'John',
        lastName: 'Venom',
        email: 'john@wavvapay.com',
        phone: '+1234567890',
        username: 'johndoe',
        passwordHash: hashedPassword,
        emailVerified: true,
        phoneVerified: true,
        qrCodeData: `wavva_pay_john_${Date.now()}`,
        isAdmin: true,
      },
      {
        firstName: 'Jane',
        lastName: 'Symbiote',
        email: 'jane@wavvapay.com',
        phone: '+1234567891',
        username: 'janedoe',
        passwordHash: hashedPassword,
        emailVerified: true,
        phoneVerified: true,
        qrCodeData: `wavva_pay_jane_${Date.now()}`,
      },
      {
        firstName: 'Eddie',
        lastName: 'Brock',
        email: 'eddie@wavvapay.com',
        phone: '+1234567892',
        username: 'eddybrock',
        passwordHash: hashedPassword,
        emailVerified: true,
        phoneVerified: true,
        qrCodeData: `wavva_pay_eddie_${Date.now()}`,
      },
      {
        firstName: 'Peter',
        lastName: 'Parker',
        email: 'peter@wavvapay.com',
        phone: '+1234567893',
        username: 'peterparker',
        passwordHash: hashedPassword,
        emailVerified: true,
        phoneVerified: true,
        qrCodeData: `wavva_pay_peter_${Date.now()}`,
      },
    ];

    const createdUsers = await User.insertMany(users);
    logger.info(`Created ${createdUsers.length} users`);

    // Create wallets for each user
    const wallets = createdUsers.map(user => ({
      userId: user._id,
      balance: 10000 * 100, // ₦10,000 in cents
      currency: 'NGN',
      dailyLimit: 10000 * 100,
      monthlyLimit: 100000 * 100,
      multicurrencyBalances: [
        { currency: 'EUR', balance: 5000 * 100 },
        { currency: 'GBP', balance: 3000 * 100 },
      ],
    }));

    const createdWallets = await Wallet.insertMany(wallets);
    logger.info(`Created ${createdWallets.length} wallets`);

    // Update users with wallet references and add friends
    for (let i = 0; i < createdUsers.length; i++) {
      createdUsers[i].walletId = createdWallets[i]._id;
      // Add other users as friends
      createdUsers[i].friends = createdUsers.filter((_, idx) => idx !== i).map(u => u._id);
      await createdUsers[i].save();
    }

    // Create sample transactions
    const transactions = [
      {
        sender: createdUsers[0]._id,
        receiver: createdUsers[1]._id,
        amount: 5000, // ₦50
        currency: 'NGN',
        type: 'peer-to-peer',
        status: 'completed',
        description: 'Coffee payment',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      },
      {
        sender: createdUsers[1]._id,
        receiver: createdUsers[2]._id,
        amount: 12500, // ₦125
        currency: 'NGN',
        type: 'peer-to-peer',
        status: 'completed',
        description: 'Dinner split',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      },
      {
        sender: createdUsers[2]._id,
        receiver: createdUsers[3]._id,
        amount: 7500, // ₦75
        currency: 'NGN',
        type: 'peer-to-peer',
        status: 'pending',
        description: 'Movie tickets',
      },
    ];

    const createdTransactions = await Transaction.insertMany(transactions);
    logger.info(`Created ${createdTransactions.length} transactions`);

    // Create sample combine (group expense)
    const combine = new Combine({
      name: 'Weekend Trip',
      description: 'Cabin rental and expenses',
      createdBy: createdUsers[0]._id,
      members: [
        { userId: createdUsers[0]._id, role: 'admin' },
        { userId: createdUsers[1]._id, role: 'member' },
        { userId: createdUsers[2]._id, role: 'member' },
      ],
      totalAmount: 30000, // ₦300
      currency: 'NGN',
      status: 'active',
    });

    await combine.save();
    logger.info('Created 1 combine');

    // Create sample expenses for the combine
    const expenses = [
      {
        combineId: combine._id,
        description: 'Cabin rental',
        amount: 20000, // ₦200
        currency: 'NGN',
        paidBy: createdUsers[0]._id,
        splitAmong: [createdUsers[0]._id, createdUsers[1]._id, createdUsers[2]._id],
        splitAmount: 6667, // ₦66.67 per person
      },
      {
        combineId: combine._id,
        description: 'Groceries',
        amount: 10000, // ₦100
        currency: 'NGN',
        paidBy: createdUsers[1]._id,
        splitAmong: [createdUsers[0]._id, createdUsers[1]._id, createdUsers[2]._id],
        splitAmount: 3333, // $33.33 per person
      },
    ];

    const createdExpenses = await Expense.insertMany(expenses);
    logger.info(`Created ${createdExpenses.length} expenses`);

    // Update combine with expense references
    combine.expenses = createdExpenses.map(e => e._id);
    await combine.save();

    logger.info('✅ Seeding completed successfully!');
    logger.info('='.repeat(50));
    logger.info('TEST USERS:');
    logger.info('Admin: john@wavvapay.com / password123');
    logger.info('User: jane@wavvapay.com / password123');
    logger.info('User: eddie@wavvapay.com / password123');
    logger.info('User: peter@wavvapay.com / password123');
    logger.info('='.repeat(50));
    logger.info(`💰 Balance per user: $${(10000 * 100) / 100}`);
    logger.info(`📊 Created ${createdUsers.length} users, ${createdWallets.length} wallets`);
    logger.info(`💸 Created ${createdTransactions.length} transactions`);
    logger.info(`👥 Created 1 combine with ${createdExpenses.length} expenses`);
    logger.info('='.repeat(50));

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    logger.error('Seeding failed', err.message);
    process.exit(1);
  }
};

seed();
