const User = require('../models/User');
const Merchant = require('../models/Merchant');
const MerchantKYC = require('../models/MerchantKYC');
const MerchantWallet = require('../models/MerchantWallet');
const MerchantTransaction = require('../models/MerchantTransaction');
const Settlement = require('../models/Settlement');
const { calculateFee } = require('../utils/feeCalculator');

// Register as Merchant
const registerMerchant = async (req, res) => {
  try {
    const userId = req.userId;
    const { businessName, businessType, phone, website, description } = req.body;

    // Validation
    if (!businessName || !businessType || !phone) {
      return res.status(400).json({ error: 'Business name, type, and phone are required' });
    }

    const validBusinessTypes = ['sole_proprietor', 'sme', 'corporate', 'ngo'];
    if (!validBusinessTypes.includes(businessType)) {
      return res.status(400).json({ error: 'Invalid business type' });
    }

    // Check if already a merchant
    const existingMerchant = await Merchant.findOne({ userId });
    if (existingMerchant) {
      return res.status(400).json({ error: 'User is already registered as a merchant' });
    }

    // Create merchant account
    const merchant = new Merchant({
      userId,
      businessName,
      businessType,
      phone,
      website,
      description,
      status: 'pending', // Awaiting KYC
    });

    await merchant.save();

    // Create merchant wallet
    const wallet = new MerchantWallet({
      merchantId: merchant._id,
      currency: 'NGN'
    });

    await wallet.save();

    // Create KYC record
    const kyc = new MerchantKYC({
      merchantId: merchant._id,
      status: 'pending'
    });

    await kyc.save();

    // Update merchant with KYC ID
    merchant.kycId = kyc._id;
    await merchant.save();

    res.json({
      success: true,
      message: 'Merchant account created successfully. Please complete KYC verification.',
      merchant: {
        _id: merchant._id,
        businessName: merchant.businessName,
        businessType: merchant.businessType,
        status: merchant.status,
        kycVerified: merchant.kycVerified
      }
    });
  } catch (err) {
    console.error('Merchant registration error:', err);
    res.status(500).json({ error: 'Failed to register as merchant' });
  }
};

// Get Merchant Profile
const getMerchantProfile = async (req, res) => {
  try {
    const userId = req.userId;

    const merchant = await Merchant.findOne({ userId }).populate('kycId');
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const wallet = await MerchantWallet.findOne({ merchantId: merchant._id });

    res.json({
      success: true,
      merchant: {
        _id: merchant._id,
        businessName: merchant.businessName,
        businessType: merchant.businessType,
        phone: merchant.phone,
        email: merchant.email,
        website: merchant.website,
        logo: merchant.logo,
        description: merchant.description,
        status: merchant.status,
        tier: merchant.tier,
        kycVerified: merchant.kycVerified,
        kycId: merchant.kycId,
        settings: merchant.settings,
        bankAccount: merchant.bankAccount,
        stats: {
          totalRevenue: merchant.totalRevenue / 100,
          totalTransactions: merchant.totalTransactions,
          totalCustomers: merchant.totalCustomers,
          avgTransactionValue: merchant.avgTransactionValue / 100
        },
        limits: {
          dailyTransaction: merchant.limits.dailyTransaction / 100,
          monthlyTransaction: merchant.limits.monthlyTransaction / 100,
          dailyTransactionCount: merchant.limits.dailyTransactionCount,
          monthlyTransactionCount: merchant.limits.monthlyTransactionCount
        }
      },
      wallet: {
        balance: wallet.balance / 100,
        pendingBalance: wallet.pendingBalance / 100,
        settledBalance: wallet.settledBalance / 100,
        totalEarned: wallet.totalEarned / 100,
        totalCommission: wallet.totalCommission / 100,
        totalSettled: wallet.totalSettled / 100
      },
      createdAt: merchant.createdAt
    });
  } catch (err) {
    console.error('Get merchant profile error:', err);
    res.status(500).json({ error: 'Failed to fetch merchant profile' });
  }
};

// Update Merchant Profile
const updateMerchantProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const { businessName, phone, website, description, email } = req.body;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    // Update fields
    if (businessName) merchant.businessName = businessName;
    if (phone) merchant.phone = phone;
    if (website) merchant.website = website;
    if (description) merchant.description = description;
    if (email) merchant.email = email;

    await merchant.save();

    res.json({
      success: true,
      message: 'Merchant profile updated successfully',
      merchant: {
        _id: merchant._id,
        businessName: merchant.businessName,
        businessType: merchant.businessType,
        phone: merchant.phone,
        email: merchant.email,
        website: merchant.website,
        description: merchant.description
      }
    });
  } catch (err) {
    console.error('Update merchant profile error:', err);
    res.status(500).json({ error: 'Failed to update merchant profile' });
  }
};

// Update Settlement Settings
const updateSettlementSettings = async (req, res) => {
  try {
    const userId = req.userId;
    const { autoSettlement, settlementFrequency, settlementDay } = req.body;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    if (autoSettlement !== undefined) merchant.settings.autoSettlement = autoSettlement;
    if (settlementFrequency) merchant.settings.settlementFrequency = settlementFrequency;
    if (settlementDay !== undefined) merchant.settings.settlementDay = settlementDay;

    await merchant.save();

    res.json({
      success: true,
      message: 'Settlement settings updated',
      settings: merchant.settings
    });
  } catch (err) {
    console.error('Update settlement settings error:', err);
    res.status(500).json({ error: 'Failed to update settlement settings' });
  }
};

// Add Bank Account for Settlement
const addBankAccount = async (req, res) => {
  try {
    const userId = req.userId;
    const { accountNumber, bankCode, bankName, accountName } = req.body;

    if (!accountNumber || !bankCode || !accountName) {
      return res.status(400).json({ error: 'Account number, bank code, and account name are required' });
    }

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    merchant.bankAccount = {
      accountNumber,
      bankCode,
      bankName,
      accountName,
      verified: false
    };

    await merchant.save();

    res.json({
      success: true,
      message: 'Bank account added successfully',
      bankAccount: merchant.bankAccount
    });
  } catch (err) {
    console.error('Add bank account error:', err);
    res.status(500).json({ error: 'Failed to add bank account' });
  }
};

// Generate API Key
const generateAPIKey = async (req, res) => {
  try {
    const userId = req.userId;
    const { name } = req.body;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const key = merchant.generateAPIKey(name || 'API Key');
    await merchant.save();

    res.json({
      success: true,
      message: 'API key generated successfully',
      apiKey: key,
      warning: 'Save this key safely. You will not be able to see it again.'
    });
  } catch (err) {
    console.error('Generate API key error:', err);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
};

// Get API Keys
const getAPIKeys = async (req, res) => {
  try {
    const userId = req.userId;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    res.json({
      success: true,
      apiKeys: merchant.apiKeys.map(k => ({
        id: k._id,
        name: k.name,
        keyPreview: k.key.substring(0, 10) + '***',
        active: k.active,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt
      }))
    });
  } catch (err) {
    console.error('Get API keys error:', err);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
};

// Update Webhook Settings
const updateWebhookSettings = async (req, res) => {
  try {
    const userId = req.userId;
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ error: 'Webhook URL is required' });
    }

    // Validate URL
    try {
      new URL(webhookUrl);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid webhook URL format' });
    }

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Generate webhook secret if not exists
    const crypto = require('crypto');
    if (!merchant.webhookSecret) {
      merchant.webhookSecret = crypto.randomBytes(32).toString('hex');
    }

    merchant.webhookUrl = webhookUrl;
    await merchant.save();

    res.json({
      success: true,
      message: 'Webhook settings updated successfully',
      webhook: {
        url: merchant.webhookUrl,
        secret: merchant.webhookSecret,
        secretWarning: 'Keep this secret secure. Use it to verify incoming webhooks.'
      }
    });
  } catch (err) {
    console.error('Update webhook settings error:', err);
    res.status(500).json({ error: 'Failed to update webhook settings' });
  }
};

// Get Webhook Settings
const getWebhookSettings = async (req, res) => {
  try {
    const userId = req.userId;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    res.json({
      success: true,
      webhook: {
        url: merchant.webhookUrl || null,
        secret: merchant.webhookSecret ? merchant.webhookSecret.substring(0, 8) + '***' : null,
        configured: !!merchant.webhookUrl
      }
    });
  } catch (err) {
    console.error('Get webhook settings error:', err);
    res.status(500).json({ error: 'Failed to fetch webhook settings' });
  }
};

// Test Webhook
const testWebhook = async (req, res) => {
  try {
    const userId = req.userId;
    const axios = require('axios');
    const crypto = require('crypto');

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    if (!merchant.webhookUrl) {
      return res.status(400).json({ error: 'No webhook URL configured' });
    }

    // Create test payload
    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from Wavva Pay'
      }
    };

    // Sign payload with webhook secret
    const signature = crypto
      .createHmac('sha256', merchant.webhookSecret || '')
      .update(JSON.stringify(testPayload))
      .digest('hex');

    try {
      // Send test webhook
      await axios.post(merchant.webhookUrl, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': new Date().toISOString()
        },
        timeout: 10000
      });

      res.json({
        success: true,
        message: 'Test webhook sent successfully',
        payload: testPayload,
        status: 'delivered'
      });
    } catch (webhookError) {
      res.status(400).json({
        success: false,
        message: 'Webhook delivery failed',
        error: webhookError.message,
        hint: 'Ensure your webhook endpoint is accessible and responds with 2xx status code'
      });
    }
  } catch (err) {
    console.error('Test webhook error:', err);
    res.status(500).json({ error: 'Failed to test webhook' });
  }
};

module.exports = {
  registerMerchant,
  getMerchantProfile,
  updateMerchantProfile,
  updateSettlementSettings,
  addBankAccount,
  generateAPIKey,
  getAPIKeys,
  updateWebhookSettings,
  getWebhookSettings,
  testWebhook
};
