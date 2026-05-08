import api from './client';

export const register = (data) => api.post('/api/auth/register', data);
export const login = (data) => api.post('/api/auth/login', data);
export const getMe = () => api.get('/api/auth/me');
export const kycUpgrade = (data) => api.post('/api/auth/kyc-upgrade', data);
