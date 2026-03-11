const Merchant = require('../models/Merchant');
const PaymentLink = require('../models/PaymentLink');
const MerchantTransaction = require('../models/MerchantTransaction');
const MerchantWallet = require('../models/MerchantWallet');
const QRCode = require('qrcode');
const flutterwaveService = require('../services/flutterwave');
const axios = require('axios');
const crypto = require('crypto');

// Create Payment Link
const createPaymentLink = async (req, res) => {
  try {
    const userId = req.userId;
    const { title, description, amount, currency = 'NGN', slug, allowCustomAmount, metadata } = req.body;

    // Validation
    if (!title || (!amount && !allowCustomAmount)) {
      return res.status(400).json({ error: 'Title and amount (or allowCustomAmount) are required' });
    }

    // Get merchant
    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    if (!merchant.kycVerified) {
      return res.status(400).json({ error: 'Please complete KYC verification first' });
    }

    // Check if slug is unique (if provided)
    if (slug) {
      const existingSlug = await PaymentLink.findOne({ slug });
      if (existingSlug) {
        return res.status(400).json({ error: 'This slug is already taken' });
      }
    }

    // Create payment link
    const paymentLink = new PaymentLink({
      merchantId: merchant._id,
      title,
      description,
      amount: amount ? Math.round(amount * 100) : null,
      currency,
      slug: slug || `link_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      allowCustomAmount: allowCustomAmount || false,
      metadata: metadata || {}
    });

    await paymentLink.save();

    // Generate QR Code
    const qrData = {
      linkId: paymentLink._id.toString(),
      merchantId: merchant._id.toString(),
      amount: paymentLink.amount,
      title: paymentLink.title
    };

    const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrData));
    paymentLink.qrCode = qrCodeUrl;
    await paymentLink.save();

    const publicUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pay/${paymentLink.slug}`;

    res.json({
      success: true,
      message: 'Payment link created successfully',
      paymentLink: {
        _id: paymentLink._id,
        title: paymentLink.title,
        description: paymentLink.description,
        amount: paymentLink.amount ? paymentLink.amount / 100 : 'variable',
        currency: paymentLink.currency,
        slug: paymentLink.slug,
        publicUrl,
        qrCode: paymentLink.qrCode,
        status: paymentLink.status,
        views: paymentLink.views,
        completedCount: paymentLink.completedCount,
        createdAt: paymentLink.createdAt,
        shareUrl: {
          whatsapp: `https://wa.me/?text=${encodeURIComponent(publicUrl)}`,
          email: `mailto:?subject=Payment Link&body=${encodeURIComponent(publicUrl)}`,
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`
        }
      }
    });
  } catch (err) {
    console.error('Create payment link error:', err);
    res.status(500).json({ error: 'Failed to create payment link' });
  }
};

// Get Payment Links
const getPaymentLinks = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, status } = req.query;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const query = { merchantId: merchant._id };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const paymentLinks = await PaymentLink.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PaymentLink.countDocuments(query);

    res.json({
      success: true,
      paymentLinks: paymentLinks.map(link => ({
        _id: link._id,
        title: link.title,
        amount: link.amount ? link.amount / 100 : 'variable',
        slug: link.slug,
        status: link.status,
        views: link.views,
        completedCount: link.completedCount,
        totalValue: link.totalValue / 100,
        createdAt: link.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Get payment links error:', err);
    res.status(500).json({ error: 'Failed to fetch payment links' });
  }
};

// Get Payment Link Details
const getPaymentLinkDetails = async (req, res) => {
  try {
    const userId = req.userId;
    const { linkId } = req.params;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const paymentLink = await PaymentLink.findOne({
      _id: linkId,
      merchantId: merchant._id
    });

    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Get related transactions
    const transactions = await MerchantTransaction.find({
      paymentLinkId: linkId,
      status: 'completed'
    }).select('amount currency status createdAt customerName');

    const publicUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pay/${paymentLink.slug}`;

    res.json({
      success: true,
      paymentLink: {
        _id: paymentLink._id,
        title: paymentLink.title,
        description: paymentLink.description,
        amount: paymentLink.amount ? paymentLink.amount / 100 : 'variable',
        currency: paymentLink.currency,
        slug: paymentLink.slug,
        publicUrl,
        qrCode: paymentLink.qrCode,
        status: paymentLink.status,
        views: paymentLink.views,
        completedCount: paymentLink.completedCount,
        failedCount: paymentLink.failedCount,
        totalValue: paymentLink.totalValue / 100,
        conversionRate: paymentLink.views > 0 ? ((paymentLink.completedCount / paymentLink.views) * 100).toFixed(2) + '%' : '0%',
        createdAt: paymentLink.createdAt
      },
      recentTransactions: transactions.slice(0, 10).map(t => ({
        amount: t.amount / 100,
        status: t.status,
        customerName: t.customerName,
        createdAt: t.createdAt
      })),
      analytics: {
        totalViews: paymentLink.views,
        totalInitiations: paymentLink.initiateCount,
        completedPayments: paymentLink.completedCount,
        failedPayments: paymentLink.failedCount,
        totalRevenue: paymentLink.totalValue / 100,
        averageTransactionValue: paymentLink.completedCount > 0 ? (paymentLink.totalValue / paymentLink.completedCount / 100).toFixed(2) : 0
      }
    });
  } catch (err) {
    console.error('Get payment link details error:', err);
    res.status(500).json({ error: 'Failed to fetch payment link details' });
  }
};

// Update Payment Link
const updatePaymentLink = async (req, res) => {
  try {
    const userId = req.userId;
    const { linkId } = req.params;
    const { title, description, status } = req.body;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const paymentLink = await PaymentLink.findOne({
      _id: linkId,
      merchantId: merchant._id
    });

    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    if (title) paymentLink.title = title;
    if (description !== undefined) paymentLink.description = description;
    if (status) paymentLink.status = status;

    await paymentLink.save();

    res.json({
      success: true,
      message: 'Payment link updated successfully',
      paymentLink: {
        _id: paymentLink._id,
        title: paymentLink.title,
        status: paymentLink.status
      }
    });
  } catch (err) {
    console.error('Update payment link error:', err);
    res.status(500).json({ error: 'Failed to update payment link' });
  }
};

// Delete Payment Link
const deletePaymentLink = async (req, res) => {
  try {
    const userId = req.userId;
    const { linkId } = req.params;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not found' });
    }

    const paymentLink = await PaymentLink.findOneAndDelete({
      _id: linkId,
      merchantId: merchant._id
    });

    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    res.json({
      success: true,
      message: 'Payment link deleted successfully'
    });
  } catch (err) {
    console.error('Delete payment link error:', err);
    res.status(500).json({ error: 'Failed to delete payment link' });
  }
};

// View Payment Link Public (No Auth Required)
const viewPaymentLinkPublic = async (req, res) => {
  try {
    const { slug } = req.params;

    // Find payment link by slug
    const paymentLink = await PaymentLink.findOne({ 
      slug,
      status: 'active' 
    }).populate('merchantId', 'businessName logo');

    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found or expired' });
    }

    // Increment views counter
    paymentLink.views += 1;
    await paymentLink.save();

    // Return payment form data
    res.json({
      success: true,
      paymentLink: {
        _id: paymentLink._id,
        linkId: paymentLink._id.toString(),
        title: paymentLink.title,
        description: paymentLink.description,
        amount: paymentLink.amount ? paymentLink.amount / 100 : null,
        currency: paymentLink.currency,
        slug: paymentLink.slug,
        allowCustomAmount: paymentLink.allowCustomAmount,
        paymentMethods: paymentLink.paymentMethods,
        qrCode: paymentLink.qrCode,
        successUrl: paymentLink.successUrl,
        cancelUrl: paymentLink.cancelUrl,
        views: paymentLink.views,
        completedCount: paymentLink.completedCount,
        merchant: {
          _id: paymentLink.merchantId._id,
          businessName: paymentLink.merchantId.businessName,
          logo: paymentLink.merchantId.logo
        }
      }
    });
  } catch (err) {
    console.error('View payment link public error:', err);
    res.status(500).json({ error: 'Failed to load payment link' });
  }
};

// Checkout - Customer Processes Payment on Payment Link
const checkoutPaymentLink = async (req, res) => {
  try {
    const { linkId } = req.params;
    const { amount, email, phone, name, paymentMethod } = req.body;

    // Validation
    if (!email || !phone || !name || !paymentMethod) {
      return res.status(400).json({ 
        error: 'Email, phone, name, and payment method are required' 
      });
    }

    // Find payment link
    const paymentLink = await PaymentLink.findOne({ 
      _id: linkId,
      status: 'active'
    }).populate('merchantId');

    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Validate amount
    let finalAmount = paymentLink.amount;
    if (paymentLink.allowCustomAmount) {
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Amount is required for this payment link' });
      }
      finalAmount = Math.round(amount * 100); // Convert to cents
    } else if (!finalAmount) {
      return res.status(400).json({ error: 'Invalid payment link configuration' });
    }

    // Validate payment method
    if (!paymentLink.paymentMethods.includes(paymentMethod)) {
      return res.status(400).json({ 
        error: `Payment method ${paymentMethod} not available for this link` 
      });
    }

    const merchant = paymentLink.merchantId;

    // Calculate merchant commission
    const commissionRate = merchant.settings?.commissionRate || 1.5;
    const commission = Math.round((finalAmount * commissionRate) / 100);
    const platformFee = Math.round((finalAmount * 1) / 100); // 1% platform fee
    const totalFee = commission + platformFee;
    const netAmount = finalAmount - totalFee;

    // Increment initiate count
    paymentLink.initiateCount += 1;
    await paymentLink.save();

    // For card/bank payments, use Paystack
    if (['card', 'bank_transfer'].includes(paymentMethod)) {
      const metadata = {
        merchantId: merchant._id.toString(),
        paymentLinkId: paymentLink._id.toString(),
        linkTitle: paymentLink.title,
        paymentMethod,
        customerEmail: email,
        customerPhone: phone,
        customerName: name
      };

      // Initialize Flutterwave payment (frontend will send card details)
      const reference = `PLK-${paymentLink._id}-${Date.now()}`;
      
      res.json({
        success: true,
        message: 'Payment link ready. Please provide card details to complete payment.',
        linkId: paymentLink._id,
        reference: reference,
        amount: finalAmount / 100,
        currency: paymentLink.currency,
        email: email,
        instructions: 'Send card details via /api/payments/link/{linkId}/checkout endpoint'
      });
      return;
    } else if (paymentMethod === 'bank_transfer') {
      // Bank transfer - no direct card charging needed
      return res.json({
        success: true,
        message: 'Bank transfer option selected',
        instructions: 'Manual bank transfer details will be provided'
      });
    } else {
      return res.status(400).json({ error: 'Unsupported payment method' });
    }
  } catch (error) {
    logger.error('Error checking out payment link:', error);
    res.status(500).json({ error: 'Checkout failed' });
  }
};

// Update checkout function to handle Flutterwave card charging
const checkoutPaymentLinkWithCard = async (req, res) => {
  try {
    const { linkId } = req.params;
    const { cardDetails, email, phone, name } = req.body;

    if (!linkId) {
      return res.status(400).json({ error: 'Payment link ID is required' });
    }

    if (!cardDetails || !cardDetails.pan || !cardDetails.cvv || !cardDetails.expiry || !cardDetails.pin) {
      return res.status(400).json({ 
        error: 'Card details required',
        requiredFields: ['pan', 'cvv', 'expiry (MMyy)', 'pin']
      });
    }

    const paymentLink = await PaymentLink.findById(linkId);
    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    if (paymentLink.disabled) {
      return res.status(403).json({ error: 'This payment link is no longer active' });
    }

    // Check if expired
    if (paymentLink.expiresAt && new Date() > paymentLink.expiresAt) {
      return res.status(403).json({ error: 'This payment link has expired' });
    }

    // Calculate amount with discount
    let finalAmount = paymentLink.amount;
    if (paymentLink.discountType === 'percentage') {
      finalAmount -= (paymentLink.amount * paymentLink.discountValue) / 100;
    } else if (paymentLink.discountType === 'fixed') {
      finalAmount -= paymentLink.discountValue;
    }

    // Calculate merchant commission
    const commissionRate = paymentLink.merchantId?.settings?.commissionRate || 1.5;
    const commission = Math.round((finalAmount * commissionRate) / 100);
    const platformFee = Math.round((finalAmount * 1) / 100); // 1% platform fee
    const totalFee = commission + platformFee;
    const netAmount = finalAmount - totalFee;

    // Split expiry (MMYY) into expiryMonth and expiryYear
    const expiryMonth = cardDetails.expiry.substring(0, 2);
    const expiryYear = '20' + cardDetails.expiry.substring(2, 4);

    // Charge card via Flutterwave
    const chargeResult = await flutterwaveService.initializeCardPayment(
      {
        cardNumber: cardDetails.pan,
        cvv: cardDetails.cvv,
        expiryMonth: expiryMonth,
        expiryYear: expiryYear
      },
      finalAmount / 100,
      email,
      phone,
      { 
        fullName: name,
        paymentLink: linkId
      }
    );

    if (!chargeResult.success) {
      return res.status(400).json({ 
        error: 'Card charge failed',
        message: chargeResult.error,
        status: chargeResult.status
      });
    }

    // Create merchant transaction record
    const merchantTransaction = new MerchantTransaction({
      merchantId: paymentLink.merchantId,
      paymentLinkId: paymentLink._id,
      customerId: null, // Guest payment
      customerEmail: email,
      customerPhone: phone,
      customerName: name,
      amount: finalAmount,
      currency: paymentLink.currency,
      commission: commission,
      platformFee: platformFee,
      totalFee: totalFee,
      netAmount: netAmount,
      status: 'completed',
      paymentMethod: 'card',
      paystackReference: chargeResult.reference,
      paystackTransactionId: chargeResult.transactionId,
      paymentGateway: 'flutterwave',
      metadata: {
        paymentLink: linkId,
        customFields: paymentLink.customFields
      }
    });

    await merchantTransaction.save();

    // Update payment link checkout count
    paymentLink.checkoutCount += 1;
    paymentLink.completedCheckoutCount += 1;
    await paymentLink.save();

    // Send success response
    res.json({
      success: true,
      message: 'Payment successful',
      transactionId: merchantTransaction._id,
      reference: chargeResult.reference,
      amount: finalAmount / 100,
      currency: paymentLink.currency
    });
  } catch (error) {
    logger.error('Error processing payment link checkout:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
};

// Keep the old checkout for backwards compatibility but mark as deprecated
const checkoutPaymentLinkLegacy = async (req, res) => {
  try {
    const { linkId } = req.params;
    const { paymentMethod = 'card', email, phone, name } = req.body;

    if (!linkId) {
      return res.status(400).json({ error: 'Payment link ID is required' });
    }

    const paymentLink = await PaymentLink.findById(linkId);
    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    if (paymentLink.disabled) {
      return res.status(403).json({ error: 'This payment link is no longer active' });
    }

    // Check if expired
    if (paymentLink.expiresAt && new Date() > paymentLink.expiresAt) {
      return res.status(403).json({ error: 'This payment link has expired' });
    }

    // Validate payment method
    if (!paymentLink.paymentMethods.includes(paymentMethod)) {
      return res.status(400).json({ 
        error: `Payment method ${paymentMethod} not available for this link` 
      });
    }

    const merchant = paymentLink.merchantId;

    // Calculate merchant commission
    const commissionRate = merchant.settings?.commissionRate || 1.5;
    const commission = Math.round((finalAmount * commissionRate) / 100);
    const platformFee = Math.round((finalAmount * 1) / 100); // 1% platform fee
    const totalFee = commission + platformFee;
    const netAmount = finalAmount - totalFee;

    // Increment initiate count
    paymentLink.initiateCount += 1;
    await paymentLink.save();

    // For card/bank payments, use Flutterwave
    if (['card', 'bank_transfer'].includes(paymentMethod)) {
      const reference = `PLK-${paymentLink._id}-${Date.now()}`;
      
      return res.json({
        success: true,
        message: 'Payment initialization ready',
        reference: reference,
        amount: finalAmount / 100,
        currency: paymentLink.currency,
        paymentMethod: paymentMethod,
        instructions: 'Provide card details to Flutterwave endpoint or bank transfer details'
      });
    } else {
      return res.status(400).json({ error: 'Unsupported payment method' });
    }
  } catch (error) {
    logger.error('Error checking out payment link:', error);
    res.status(500).json({ error: 'Checkout failed' });
  }
};

// Old function - kept for backward compatibility during migration
const checkoutPaymentLinkOld = async (req, res) => {
  try {
    const { linkId } = req.params;
    const { paymentMethod = 'card', email, phone, name } = req.body;

    if (!linkId) {
      return res.status(400).json({ error: 'Payment link ID is required' });
    }

    const paymentLink = await PaymentLink.findById(linkId);
    if (!paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    if (paymentLink.disabled) {
      return res.status(403).json({ error: 'This payment link is no longer active' });
    }

    // Check if expired
    if (paymentLink.expiresAt && new Date() > paymentLink.expiresAt) {
      return res.status(403).json({ error: 'This payment link has expired' });
    }

    // Validate payment method
    if (!paymentLink.paymentMethods.includes(paymentMethod)) {
      return res.status(400).json({ 
        error: `Payment method ${paymentMethod} not available for this link` 
      });
    }

    // For card/bank payments, use Flutterwave
    if (['card', 'bank_transfer'].includes(paymentMethod)) {
      const reference = `PLK-${paymentLink._id}-${Date.now()}`;
      
      return res.json({
        success: true,
        message: 'Payment initialization via Flutterwave',
        reference: reference,
        amount: paymentLink.amount / 100,
        currency: paymentLink.currency,
        paymentMethod: paymentMethod
      });
    } else {
      return res.status(400).json({ error: 'Unsupported payment method' });
    }
  } catch (err) {
    console.error('Checkout payment link error:', err);
    res.status(500).json({ error: 'Payment processing failed' });
  }
};

// Verify Payment for Payment Link (Called via webhook from Paystack)
const verifyPaymentLink = async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }

    // Verify with Paystack
    const paystackResult = await paystackService.verifyPayment(reference);

    if (!paystackResult.success) {
      // Update transaction to failed
      await MerchantTransaction.findOneAndUpdate(
        { paystackReference: reference },
        { status: 'failed', failedAt: new Date() }
      );

      return res.status(400).json({ error: paystackResult.error });
    }

    // Find transaction
    const transaction = await MerchantTransaction.findOne({
      paystackReference: reference
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update transaction to completed
    transaction.status = 'completed';
    transaction.completedAt = new Date();
    transaction.paystackTransactionId = paystackResult.transactionId;
    await transaction.save();

    // Add net amount to merchant wallet
    const wallet = await MerchantWallet.findOne({ merchantId: transaction.merchantId });
    if (wallet) {
      wallet.addFunds(transaction.netAmount, `Payment from link: ${transaction._id}`);
      await wallet.save();
    }

    // Update payment link completed count and total value
    const paymentLink = await PaymentLink.findById(transaction.paymentLinkId);
    if (paymentLink) {
      paymentLink.completedCount += 1;
      paymentLink.totalValue += transaction.netAmount;
      await paymentLink.save();
    }

    // Get merchant to send webhook notification
    const merchant = await Merchant.findById(transaction.merchantId);

    // Trigger webhook notification to merchant (async, don't wait for response)
    if (merchant && merchant.webhookUrl) {
      triggerWebhook(merchant, 'payment.completed', {
        transactionId: transaction._id.toString(),
        linkId: transaction.paymentLinkId.toString(),
        amount: transaction.amount / 100,
        commission: transaction.commission / 100,
        netAmount: transaction.netAmount / 100,
        currency: transaction.currency,
        customerEmail: transaction.customerEmail,
        customerPhone: transaction.customerPhone,
        customerName: transaction.customerName,
        paymentMethod: transaction.paymentMethod,
        status: transaction.status,
        completedAt: transaction.completedAt,
        reference: reference
      }).catch(err => {
        console.error('Webhook notification failed:', err.message);
      });
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      transaction: {
        _id: transaction._id,
        amount: transaction.amount / 100,
        netAmount: transaction.netAmount / 100,
        status: transaction.status,
        reference: reference
      }
    });
  } catch (err) {
    console.error('Verify payment link error:', err);
    res.status(500).json({ error: 'Payment verification failed' });
  }
};

// Helper function to trigger webhooks
const triggerWebhook = async (merchant, event, data) => {
  try {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      merchantId: merchant._id.toString(),
      data
    };

    // Sign payload with merchant's webhook secret
    const signature = crypto
      .createHmac('sha256', merchant.webhookSecret || '')
      .update(JSON.stringify(payload))
      .digest('hex');

    // Send webhook
    await axios.post(merchant.webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': new Date().toISOString(),
        'X-Webhook-Event': event
      },
      timeout: 10000
    });

    console.log(`✅ Webhook sent for event: ${event} to ${merchant.businessName}`);
  } catch (error) {
    console.error(`❌ Failed to send webhook: ${error.message}`);
    // Don't throw - webhooks are async and shouldn't block payment confirmation
    throw error;
  }
};

module.exports = {
  createPaymentLink,
  getPaymentLinks,
  getPaymentLinkDetails,
  updatePaymentLink,
  deletePaymentLink,
  viewPaymentLinkPublic,
  checkoutPaymentLink,
  verifyPaymentLink
};
