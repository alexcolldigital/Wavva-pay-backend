import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { fundWallet } from '../api/wallet';
import { useAuth } from '../context/AuthContext';

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000];

export default function FundScreen() {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFund = async () => {
    if (!amount || parseFloat(amount) < 100) {
      return Alert.alert('Error', 'Minimum amount is ₦100');
    }
    setLoading(true);
    try {
      const res = await fundWallet({
        amount: Math.round(parseFloat(amount) * 100),
        email: user?.email,
      });
      const link = res.data?.data?.authorization_url || res.data?.data?.link || res.data?.paymentLink;
      if (link) {
        await Linking.openURL(link);
      } else {
        Alert.alert('Error', 'Could not get payment link');
      }
    } catch (err) {
      Alert.alert('Failed', err.response?.data?.error || 'Payment initialization failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.icon}>💳</Text>
        <Text style={styles.title}>Fund Your Wallet</Text>
        <Text style={styles.subtitle}>Pay with card, bank transfer, or USSD</Text>

        <Text style={styles.label}>Quick amounts</Text>
        <View style={styles.quickGrid}>
          {QUICK_AMOUNTS.map((a) => (
            <TouchableOpacity
              key={a}
              style={[styles.quickBtn, amount === String(a) && styles.quickBtnActive]}
              onPress={() => setAmount(String(a))}
            >
              <Text style={[styles.quickBtnText, amount === String(a) && styles.quickBtnTextActive]}>
                ₦{a.toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Or enter custom amount (₦)</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter amount"
          placeholderTextColor="#9ca3af"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />

        <TouchableOpacity style={styles.btn} onPress={handleFund} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Fund Wallet</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 10, marginTop: 8 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  quickBtn: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, backgroundColor: '#f9fafb' },
  quickBtnActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  quickBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  quickBtnTextActive: { color: '#6366f1' },
  input: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 15, color: '#111', backgroundColor: '#fafafa', marginBottom: 4 },
  btn: { marginTop: 16, backgroundColor: '#10b981', borderRadius: 14, padding: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
