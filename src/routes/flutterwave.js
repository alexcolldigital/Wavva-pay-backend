// Flutterwave Routes
const express = require('express');
const authMiddleware = require('../middleware/auth');
const flutterwaveService = require('../services/flutterwave');

const router = express.Router();

// Payment Routes
router.post('/payment/initialize', authMiddleware, async (req, res) => {
  try {
    const { amount, currency = 'NGN', metadata = {} } = req.body;
    const { email } = req;

    const result = await flutterwaveService.initializePayment(email, amount, currency, metadata);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Flutterwave payment initialization error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Payment initialization failed'
    });
  }
});

router.post('/payment/verify/:transactionId', authMiddleware, async (req, res) => {
  try {
    const { transactionId } = req.params;

    const result = await flutterwaveService.verifyPayment(transactionId);

    res.json(result);
  } catch (error) {
    console.error('Flutterwave payment verification error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Payment verification failed'
    });
  }
});

// Transfer Routes
router.post('/transfer', authMiddleware, async (req, res) => {
  try {
    const { account_number, account_bank, amount, currency = 'NGN', narrative } = req.body;

    const result = await flutterwaveService.initiateBankTransfer(account_number, account_bank, amount, currency, narrative);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Flutterwave transfer error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Transfer failed'
    });
  }
});

router.get('/transfer/:transferId', authMiddleware, async (req, res) => {
  try {
    const { transferId } = req.params;

    const result = await flutterwaveService.getTransferStatus(transferId);

    res.json(result);
  } catch (error) {
    console.error('Flutterwave transfer status error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get transfer status'
    });
  }
});

// Bank Account Verification
router.post('/account/resolve', authMiddleware, async (req, res) => {
  try {
    const { account_number, account_bank } = req.body;

    const result = await flutterwaveService.resolveBankAccount(account_number, account_bank);

    res.json(result);
  } catch (error) {
    console.error('Flutterwave account resolution error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Account resolution failed'
    });
  }
});

// Bank List
router.get('/banks', authMiddleware, async (req, res) => {
  try {
    const { country = 'NG' } = req.query;

    const result = await flutterwaveService.getBankList(country);

    res.json(result);
  } catch (error) {
    console.error('Flutterwave bank list error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get bank list'
    });
  }
});

// Airtime Routes
router.post('/airtime/buy', authMiddleware, async (req, res) => {
  try {
    const { networkCode, phoneNumber, amount } = req.body;

    const result = await flutterwaveService.buyAirtime(networkCode, phoneNumber, amount);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Flutterwave airtime purchase error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Airtime purchase failed'
    });
  }
});

// Data Bundle Routes
router.post('/data/buy', authMiddleware, async (req, res) => {
  try {
    const { networkCode, phoneNumber, dataPlanId, amount } = req.body;

    const result = await flutterwaveService.buyDataBundle(networkCode, phoneNumber, dataPlanId, amount);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Flutterwave data purchase error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Data purchase failed'
    });
  }
});

router.get('/data/plans/:networkCode', authMiddleware, (req, res) => {
  try {
    const { networkCode } = req.params;

    const plans = flutterwaveService.getDataPlans(networkCode);

    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    console.error('Flutterwave data plans error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get data plans'
    });
  }
});

// Bill Payment Routes
router.post('/bill/pay', authMiddleware, async (req, res) => {
  try {
    const { billerId, customerReference, amount } = req.body;

    const result = await flutterwaveService.payBill(billerId, customerReference, amount);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Flutterwave bill payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Bill payment failed'
    });
  }
});

// Utility Routes
router.get('/electricity/providers', authMiddleware, (req, res) => {
  const providers = flutterwaveService.getElectricityProviders();
  res.json(providers);
});

router.get('/cable/providers', authMiddleware, (req, res) => {
  const providers = flutterwaveService.getCableProviders();
  res.json(providers);
});

router.get('/betting/providers', authMiddleware, (req, res) => {
  const providers = flutterwaveService.getBettingProviders();
  res.json(providers);
});

// Card Payment Routes
router.post('/card/payment', authMiddleware, async (req, res) => {
  try {
    const { email, amount, cardDetails, metadata = {} } = req.body;

    const result = await flutterwaveService.processCardPayment(email, amount, cardDetails, metadata);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Flutterwave card payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Card payment failed'
    });
  }
});

// Recurring Payment Routes
router.post('/subscription/create', authMiddleware, async (req, res) => {
  try {
    const { email, amount, interval, cardDetails, metadata = {} } = req.body;

    const result = await flutterwaveService.createRecurringPayment(email, amount, interval, cardDetails, metadata);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Flutterwave recurring payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Recurring payment setup failed'
    });
  }
});

// Checkout Session Routes
router.post('/checkout/create', authMiddleware, async (req, res) => {
  try {
    const checkoutData = req.body;

    const result = await flutterwaveService.createCheckoutSession(checkoutData);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Flutterwave checkout creation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Checkout creation failed'
    });
  }
});

// QR Code Payment Routes
router.post('/qr/generate', authMiddleware, async (req, res) => {
  try {
    const { merchantId, amount, currency = 'NGN', metadata = {} } = req.body;

    const result = await flutterwaveService.generatePaymentQR(merchantId, amount, currency, metadata);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Flutterwave QR generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'QR code generation failed'
    });
  }
});

// POS Payment Routes
router.post('/pos/process', authMiddleware, async (req, res) => {
  try {
    const { merchantId, amount, posData, metadata = {} } = req.body;

    const result = await flutterwaveService.processPOSPayment(merchantId, amount, posData, metadata);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Flutterwave POS payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'POS payment failed'
    });
  }
});

// Payment Request Routes
router.post('/payment-request/create', authMiddleware, async (req, res) => {
  try {
    const { senderId, amount, currency = 'NGN', description, metadata = {} } = req.body;

    const result = await flutterwaveService.createPaymentRequest(senderId, amount, currency, description, metadata);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Flutterwave payment request error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Payment request creation failed'
    });
  }
});

module.exports = router;