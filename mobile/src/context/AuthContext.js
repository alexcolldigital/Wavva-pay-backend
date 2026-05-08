import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { login as apiLogin, register as apiRegister, getMe } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync('token').then(async (token) => {
      if (token) {
        try {
          const res = await getMe();
          setUser(res.data.user);
        } catch {
          await SecureStore.deleteItemAsync('token');
        }
      }
      setLoading(false);
    });
  }, []);

  const login = async (email, password) => {
    const res = await apiLogin({ email, password });
    const { token, user: u } = res.data;
    await SecureStore.setItemAsync('token', token);
    setUser(u);
    return u;
  };

  const register = async (data) => {
    const res = await apiRegister(data);
    const { token, user: u } = res.data;
    await SecureStore.setItemAsync('token', token);
    setUser(u);
    return u;
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
