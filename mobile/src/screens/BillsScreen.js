import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { buyAirtime } from '../api/wallet';

const NETWORKS = ['MTN', 'Airtel', 'Glo', '9mobile'];
const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

export default function BillsScreen() {
  const [network, setNetwork] = useState('MTN');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const handleBuy = async () => {
    if (!phone || !amount) return Alert.alert('Error', 'Fill in all fields');
    setLoading(true);
    try {
      await buyAirtime({ network, phone, amount: Math.round(parseFloat(amount) * 100) });
      Alert.alert('Success', `₦${amount} airtime sent to ${phone}`);
      setPhone(''); setAmount('');
    } catch (err) {
      Alert.alert('Failed', err.response?.data?.error || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.icon}>📞</Text>
        <Text style={styles.title}>Buy Airtime</Text>

        <Text style={styles.label}>Network</Text>
        <View style={styles.networkGrid}>
          {NETWORKS.map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.networkBtn, network === n && styles.networkBtnActive]}
              onPress={() => setNetwork(n)}
            >
              <Text style={[styles.networkText, network === n && styles.networkTextActive]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          placeholder="08012345678"
          placeholderTextColor="#9ca3af"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        <Text style={styles.label}>Amount (₦)</Text>
        <View style={styles.quickGrid}>
          {QUICK_AMOUNTS.map((a) => (
            <TouchableOpacity
              key={a}
              style={[styles.quickBtn, amount === String(a) && styles.quickBtnActive]}
              onPress={() => setAmount(String(a))}
            >
              <Text style={[styles.quickText, amount === String(a) && styles.quickTextActive]}>
                ₦{a}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Or enter custom amount"
          placeholderTextColor="#9ca3af"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />

        <TouchableOpacity style={styles.btn} onPress={handleBuy} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Buy Airtime</Text>}
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
  title: { fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 12 },
  networkGrid: { flexDirection: 'row', gap: 8 },
  networkBtn: { flex: 1, padding: 10, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, alignItems: 'center', backgroundColor: '#f9fafb' },
  networkBtnActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  networkText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  networkTextActive: { color: '#6366f1' },
  input: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 15, color: '#111', backgroundColor: '#fafafa' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  quickBtn: { paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, backgroundColor: '#f9fafb' },
  quickBtnActive: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  quickText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  quickTextActive: { color: '#d97706' },
  btn: { marginTop: 16, backgroundColor: '#f59e0b', borderRadius: 14, padding: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
