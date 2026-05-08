import api from './client';

export const getWallet = () => api.get('/api/wallets');
export const getTransactions = (params) => api.get('/api/transactions', { params });
export const sendMoney = (data) => api.post('/api/payments/send', data);
export const fundWallet = (data) => api.post('/api/payments/fund/initialize', data);
export const verifyFunding = (data) => api.post('/api/payments/fund/verify', data);
export const getBanks = () => api.get('/api/payments/banks');
export const resolveAccount = (data) => api.post('/api/payments/resolve-account', data);
export const bankTransfer = (data) => api.post('/api/payments/bank-transfer', data);
export const buyAirtime = (data) => api.post('/api/payments/airtime/buy', data);
export const buyData = (data) => api.post('/api/payments/data/buy', data);
export const getDataPlans = (params) => api.get('/api/payments/data/plans', { params });
export const lookupUser = (identifier) => api.get(`/api/payments/lookup/${identifier}`);
