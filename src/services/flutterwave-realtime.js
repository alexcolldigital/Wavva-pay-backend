const axios = require('axios');
const logger = require('../utils/logger');
const EventEmitter = require('events');

const FLUTTERWAVE_BASE_URL = process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3';
const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const FLUTTERWAVE_PUBLIC_KEY = process.env.FLUTTERWAVE_PUBLIC_KEY;

class FlutterwaveRealtimeService extends EventEmitter {
  constructor() {
    super();
    this.client = axios.create({
      baseURL: FLUTTERWAVE_BASE_URL,
      timeout: 15000,
      headers: {
        'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // ============================================
  // Card Payments
  // ============================================

  async initializeCardPayment(email, amount, currency = 'NGN', metadata = {}) {
    try {
      const reference = `CARD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        tx_ref: reference,
        amount,
        currency,
        redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-callback`,
        payment_options: 'card,mobilemoney,ussd',
        customer: { email },
        customizations: {
          title: 'Wavva Pay - Fund Wallet',
          description: 'Add funds to your wallet',
          logo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/logo.png`
        },
        meta: metadata
      };

      const response = await this.client.post('/payments', payload);
      const payment = response.data.data;

      this.emit('payment:initialized', {
        reference,
        amount,
        email,
        status: 'pending',
        timestamp: new Date()
      });

      return {
        success: true,
        paymentLink: payment.link,
        reference,
        amount,
        status: 'pending'
      };
    } catch (err) {
      logger.error('Flutterwave initializeCardPayment error:', err.message);
      this.emit('payment:error', { error: err.message });
      throw err;
    }
  }

  async verifyCardPayment(transactionId) {
    try {
      const response = await this.client.get(`/transactions/${transactionId}/verify`);
      const transaction = response.data.data;

      const isSuccessful = transaction.status === 'successful';

      this.emit('payment:verified', {
        transactionId,
        reference: transaction.tx_ref,
        status: transaction.status,
        amount: transaction.amount,
        timestamp: new Date()
      });

      return {
        success: isSuccessful,
        transactionId,
        reference: transaction.tx_ref,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        paymentMethod: transaction.payment_type,
        customer: {
          email: transaction.customer?.email,
          name: transaction.customer?.name
        }
      };
    } catch (err) {
      logger.error('Flutterwave verifyCardPayment error:', err.message);
      throw err;
    }
  }

  async setupRecurringPayment(email, amount, currency = 'NGN', plan = 'monthly') {
    try {
      const reference = `REC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        tx_ref: reference,
        amount,
        currency,
        payment_options: 'card',
        customer: { email },
        customizations: {
          title: 'Wavva Pay - Recurring Payment',
          description: `${plan} recurring payment`
        },
        meta: { plan, recurring: true }
      };

      const response = await this.client.post('/payments', payload);
      const payment = response.data.data;

      this.emit('payment:recurring-setup', {
        reference,
        amount,
        plan,
        status: 'pending',
        timestamp: new Date()
      });

      return {
        success: true,
        paymentLink: payment.link,
        reference,
        plan,
        amount
      };
    } catch (err) {
      logger.error('Flutterwave setupRecurringPayment error:', err.message);
      throw err;
    }
  }

  // ============================================
  // Payment Gateway
  // ============================================

  async getMerchantPaymentStatus(reference) {
    try {
      const response = await this.client.get(`/transactions/verify_by_reference?tx_ref=${reference}`);
      const transaction = response.data.data;

      return {
        success: true,
        reference,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        customer: transaction.customer
      };
    } catch (err) {
      logger.error('Flutterwave getMerchantPaymentStatus error:', err.message);
      throw err;
    }
  }

  // ============================================
  // Bills & Airtime
  // ============================================

  async buyAirtime(networkCode, phoneNumber, amount) {
    try {
      const reference = `AIRTIME-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const networkMap = {
        'MTN': 'AIRTIME_MTN',
        'GLO': 'AIRTIME_GLO',
        'AIRTEL': 'AIRTIME_AIRTEL',
        '9MOBILE': 'AIRTIME_9MOBILE'
      };

      const billerId = networkMap[networkCode.toUpperCase()] || `AIRTIME_${networkCode.toUpperCase()}`;

      const payload = {
        country: 'NG',
        customer_id: phoneNumber,
        amount: Math.round(amount),
        type: billerId,
        reference
      };

      const response = await this.client.post('/bills', payload);
      const bill = response.data.data;

      this.emit('airtime:purchased', {
        reference,
        phoneNumber,
        network: networkCode,
        amount,
        status: response.data.status,
        timestamp: new Date()
      });

      return {
        success: response.data.status === 'success',
        reference,
        transactionId: bill.id,
        phoneNumber,
        network: networkCode,
        amount,
        status: response.data.status
      };
    } catch (err) {
      logger.error('Flutterwave buyAirtime error:', err.message);
      this.emit('airtime:error', { error: err.message });
      throw err;
    }
  }

  async buyDataBundle(networkCode, phoneNumber, dataPlanId, amount) {
    try {
      const reference = `DATA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const networkMap = {
        'MTN': 'DATA_MTN',
        'GLO': 'DATA_GLO',
        'AIRTEL': 'DATA_AIRTEL',
        '9MOBILE': 'DATA_9MOBILE'
      };

      const billerId = networkMap[networkCode.toUpperCase()] || `DATA_${networkCode.toUpperCase()}`;

      const payload = {
        country: 'NG',
        customer_id: phoneNumber,
        amount: Math.round(amount),
        type: billerId,
        reference
      };

      const response = await this.client.post('/bills', payload);
      const bill = response.data.data;

      this.emit('data:purchased', {
        reference,
        phoneNumber,
        network: networkCode,
        dataPlan: dataPlanId,
        amount,
        status: response.data.status,
        timestamp: new Date()
      });

      return {
        success: response.data.status === 'success',
        reference,
        transactionId: bill.id,
        phoneNumber,
        network: networkCode,
        dataPlan: dataPlanId,
        amount,
        status: response.data.status
      };
    } catch (err) {
      logger.error('Flutterwave buyDataBundle error:', err.message);
      this.emit('data:error', { error: err.message });
      throw err;
    }
  }

  async payElectricity(meterNumber, amount, provider = 'ELECTRICITY') {
    try {
      const reference = `ELEC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        country: 'NG',
        customer_id: meterNumber,
        amount: Math.round(amount),
        type: provider,
        reference
      };

      const response = await this.client.post('/bills', payload);
      const bill = response.data.data;

      this.emit('electricity:paid', {
        reference,
        meterNumber,
        amount,
        status: response.data.status,
        timestamp: new Date()
      });

      return {
        success: response.data.status === 'success',
        reference,
        transactionId: bill.id,
        meterNumber,
        amount,
        status: response.data.status
      };
    } catch (err) {
      logger.error('Flutterwave payElectricity error:', err.message);
      throw err;
    }
  }

  async payTVSubscription(smartCardNumber, amount, provider = 'DSTV') {
    try {
      const reference = `TV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        country: 'NG',
        customer_id: smartCardNumber,
        amount: Math.round(amount),
        type: provider,
        reference
      };

      const response = await this.client.post('/bills', payload);
      const bill = response.data.data;

      this.emit('tv:subscription-paid', {
        reference,
        smartCardNumber,
        provider,
        amount,
        status: response.data.status,
        timestamp: new Date()
      });

      return {
        success: response.data.status === 'success',
        reference,
        transactionId: bill.id,
        smartCardNumber,
        provider,
        amount,
        status: response.data.status
      };
    } catch (err) {
      logger.error('Flutterwave payTVSubscription error:', err.message);
      throw err;
    }
  }

  // ============================================
  // QR / POS / NFC Payments
  // ============================================

  async generateQRCode(amount, description = 'Wavva Pay Payment') {
    try {
      const reference = `QR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        tx_ref: reference,
        amount,
        currency: 'NGN',
        payment_options: 'card,mobilemoney,ussd',
        customizations: {
          title: 'Wavva Pay QR Payment',
          description
        }
      };

      const response = await this.client.post('/payments', payload);
      const payment = response.data.data;

      this.emit('qr:generated', {
        reference,
        amount,
        timestamp: new Date()
      });

      return {
        success: true,
        reference,
        paymentLink: payment.link,
        amount,
        qrCode: payment.link // Can be converted to QR image
      };
    } catch (err) {
      logger.error('Flutterwave generateQRCode error:', err.message);
      throw err;
    }
  }

  async createPaymentRequest(email, amount, description = 'Payment Request') {
    try {
      const reference = `PREQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        tx_ref: reference,
        amount,
        currency: 'NGN',
        redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-request`,
        payment_options: 'card,mobilemoney,ussd,bank_transfer',
        customer: { email },
        customizations: {
          title: 'Wavva Pay - Payment Request',
          description
        }
      };

      const response = await this.client.post('/payments', payload);
      const payment = response.data.data;

      this.emit('payment-request:created', {
        reference,
        email,
        amount,
        timestamp: new Date()
      });

      return {
        success: true,
        reference,
        paymentLink: payment.link,
        email,
        amount,
        description
      };
    } catch (err) {
      logger.error('Flutterwave createPaymentRequest error:', err.message);
      throw err;
    }
  }

  // ============================================
  // Transfers
  // ============================================

  async initiateTransfer(accountNumber, accountBank, amount, narration = 'Wavva Pay Transfer') {
    try {
      const reference = `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        account_number: accountNumber,
        account_bank: accountBank,
        amount: Math.round(amount),
        narration,
        reference,
        currency: 'NGN'
      };

      const response = await this.client.post('/transfers', payload);
      const transfer = response.data.data;

      this.emit('transfer:initiated', {
        reference,
        accountNumber: accountNumber.slice(-4),
        amount,
        status: transfer.status,
        timestamp: new Date()
      });

      return {
        success: true,
        transferId: transfer.id,
        reference,
        amount,
        status: transfer.status
      };
    } catch (err) {
      logger.error('Flutterwave initiateTransfer error:', err.message);
      this.emit('transfer:error', { error: err.message });
      throw err;
    }
  }

  async getTransferStatus(transferId) {
    try {
      const response = await this.client.get(`/transfers/${transferId}`);
      const transfer = response.data.data;

      this.emit('transfer:status-checked', {
        transferId,
        status: transfer.status,
        timestamp: new Date()
      });

      return {
        success: true,
        transferId,
        status: transfer.status,
        amount: transfer.amount,
        reference: transfer.reference
      };
    } catch (err) {
      logger.error('Flutterwave getTransferStatus error:', err.message);
      throw err;
    }
  }

  async resolveBankAccount(accountNumber, accountBank) {
    try {
      const response = await this.client.get('/accounts/resolve', {
        params: {
          account_number: accountNumber,
          account_bank: accountBank
        }
      });

      const account = response.data.data;

      return {
        success: true,
        accountName: account.account_name,
        accountNumber: account.account_number,
        accountBank: account.account_bank
      };
    } catch (err) {
      logger.error('Flutterwave resolveBankAccount error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ============================================
  // Utilities
  // ============================================

  async getBankList(country = 'NG') {
    try {
      const response = await this.client.get(`/banks/${country}`);
      const banks = response.data.data;

      return {
        success: true,
        banks: banks.map(b => ({
          id: b.id,
          code: b.code,
          name: b.name
        }))
      };
    } catch (err) {
      logger.warn('Flutterwave getBankList error, using fallback:', err.message);
      return {
        success: true,
        banks: [
          { id: 1, code: '044', name: 'Access Bank' },
          { id: 2, code: '050', name: 'Ecobank Nigeria' },
          { id: 3, code: '011', name: 'First Bank of Nigeria' },
          { id: 4, code: '058', name: 'Fidelity Bank' },
          { id: 5, code: '215', name: 'Guaranty Trust Bank (GTB)' },
          { id: 6, code: '033', name: 'United Bank for Africa (UBA)' },
          { id: 7, code: '035', name: 'Wema Bank' },
          { id: 8, code: '057', name: 'Zenith Bank' }
        ],
        usingFallback: true
      };
    }
  }

  getDataPlans(networkCode) {
    const plans = {
      'MTN': [
        { id: '250MB', name: '250MB', price: 25000, duration: '7 days' },
        { id: '1GB', name: '1GB', price: 100000, duration: '7 days' },
        { id: '5GB', name: '5GB', price: 500000, duration: '30 days' }
      ],
      'GLO': [
        { id: '171MB', name: '171MB', price: 25000, duration: '7 days' },
        { id: '1GB', name: '1GB', price: 100000, duration: '7 days' },
        { id: '7GB', name: '7GB', price: 500000, duration: '30 days' }
      ],
      'AIRTEL': [
        { id: '250MB', name: '250MB', price: 25000, duration: '7 days' },
        { id: '1GB', name: '1GB', price: 100000, duration: '7 days' },
        { id: '5GB', name: '5GB', price: 500000, duration: '30 days' }
      ],
      '9MOBILE': [
        { id: '500MB', name: '500MB', price: 25000, duration: '7 days' },
        { id: '1.5GB', name: '1.5GB', price: 100000, duration: '7 days' },
        { id: '8.5GB', name: '8.5GB', price: 500000, duration: '30 days' }
      ]
    };

    return plans[networkCode.toUpperCase()] || [];
  }
}

module.exports = new FlutterwaveRealtimeService();
