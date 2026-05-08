import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// For Expo Go on device, use your machine's local IP
// For emulator: use 10.0.2.2 (Android) or localhost (iOS)
const BASE_URL = 'http://localhost:4000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

export default api;
