import api from './client';

export const getWallet = () => api.get('/api/wallets');
export const getTransactions = (params) => api.get('/api/transactions', { params });
export const sendMoney = (data) => api.post('/api/payments/send', data);
export const fundWallet = (data) => api.post('/api/payments/fund/initialize', data);
export const buyAirtime = (data) => api.post('/api/payments/airtime/buy', data);
export const lookupUser = (id) => api.get(`/api/payments/lookup/${id}`);
