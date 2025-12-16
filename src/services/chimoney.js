const axios = require('axios');

const chimmoneyClient = axios.create({
  baseURL: process.env.CHIMONEY_BASE_URL,
  headers: {
    'X-API-KEY': process.env.CHIMONEY_API_KEY,
    'Content-Type': 'application/json',
  },
});

// Send money (P2P or to mobile money)
const sendMoney = async (recipientEmail, recipientPhone, amount, currency = 'USD') => {
  try {
    const response = await chimmoneyClient.post('/payouts/chimoney', {
      chimoleyEmail: recipientEmail || undefined,
      chimoneyPhone: recipientPhone || undefined,
      amount,
      currency,
    });
    
    return {
      success: true,
      transactionId: response.data.data.id,
      status: response.data.data.status,
    };
  } catch (err) {
    console.error('Chimoney sendMoney error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.message || 'Payment failed',
    };
  }
};

// Get transaction status
const getTransactionStatus = async (transactionId) => {
  try {
    const response = await chimmoneyClient.get(`/info/transaction/${transactionId}`);
    return response.data.data;
  } catch (err) {
    console.error('Chimoney getTransactionStatus error:', err.response?.data || err.message);
    return null;
  }
};

// Create multi-currency wallet
const createMulticurrencyWallet = async (userId) => {
  try {
    const response = await chimmoneyClient.post('/multicurrency-wallets/create', {
      name: `Wallet-${userId}`,
      currency: 'USD', // Primary currency
    });
    
    return {
      success: true,
      walletId: response.data.data.id,
    };
  } catch (err) {
    console.error('Chimoney createWallet error:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
};

// Transfer between multicurrency wallets
const transferBetweenWallets = async (fromWalletId, toWalletId, amount, currency) => {
  try {
    const response = await chimmoneyClient.post('/multicurrency-wallets/transfer', {
      fromWalletId,
      toWalletId,
      amount,
      currency,
    });
    
    return {
      success: true,
      transactionId: response.data.data.id,
    };
  } catch (err) {
    console.error('Chimoney transfer error:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendMoney,
  getTransactionStatus,
  createMulticurrencyWallet,
  transferBetweenWallets,
};
