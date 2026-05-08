import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { lookupUser, sendMoney } from '../api/wallet';

export default function SendScreen() {
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleLookup = async () => {
    if (!identifier.trim()) return Alert.alert('Error', 'Enter a recipient identifier');
    setLoading(true);
    try {
      const res = await lookupUser(identifier.trim());
      setRecipient(res.data.user || res.data);
      setStep(2);
    } catch (err) {
      Alert.alert('Not Found', err.response?.data?.error || 'User not found');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!amount || parseFloat(amount) <= 0) return Alert.alert('Error', 'Enter a valid amount');
    setLoading(true);
    try {
      const res = await sendMoney({
        recipientIdentifier: identifier,
        amount: Math.round(parseFloat(amount) * 100),
        description: note,
      });
      setResult(res.data);
      setStep(3);
    } catch (err) {
      Alert.alert('Transfer Failed', err.response?.data?.error || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1); setIdentifier(''); setRecipient(null);
    setAmount(''); setNote(''); setResult(null);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {step === 1 && (
          <View style={styles.card}>
            <Text style={styles.cardIcon}>💸</Text>
            <Text style={styles.cardTitle}>Send Money</Text>
            <Text style={styles.cardSub}>Enter email, phone, or WavvaTag</Text>
            <Text style={styles.label}>Recipient</Text>
            <TextInput
              style={styles.input}
              placeholder="@username or email"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              value={identifier}
              onChangeText={setIdentifier}
            />
            <TouchableOpacity style={styles.btn} onPress={handleLookup} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Find Recipient →</Text>}
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && recipient && (
          <View style={styles.card}>
            <View style={styles.recipientCard}>
              <View style={styles.recipientAvatar}>
                <Text style={styles.recipientAvatarText}>{recipient.firstName?.[0]}{recipient.lastName?.[0]}</Text>
              </View>
              <View>
                <Text style={styles.recipientName}>{recipient.firstName} {recipient.lastName}</Text>
                <Text style={styles.recipientSub}>{recipient.email || recipient.phone}</Text>
              </View>
            </View>

            <Text style={styles.label}>Amount (₦)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />

            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="What's this for?"
              placeholderTextColor="#9ca3af"
              value={note}
              onChangeText={setNote}
            />

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(1)}>
                <Text style={styles.btnSecondaryText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={handleSend} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send ₦{amount || '0'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={[styles.card, styles.successCard]}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successTitle}>Transfer Successful!</Text>
            <Text style={styles.successSub}>
              ₦{(result?.amount / 100 || parseFloat(amount)).toFixed(2)} sent to {recipient?.firstName}
            </Text>
            <Text style={styles.txRef}>Ref: {result?.transactionId || result?._id || 'N/A'}</Text>
            <TouchableOpacity style={styles.btn} onPress={reset}>
              <Text style={styles.btnText}>Send Another</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scroll: { flexGrow: 1, padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  cardIcon: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 4 },
  cardSub: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 15, color: '#111', backgroundColor: '#fafafa' },
  btn: { marginTop: 16, backgroundColor: '#6366f1', borderRadius: 14, padding: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: { marginTop: 16, backgroundColor: '#f3f4f6', borderRadius: 14, padding: 15, alignItems: 'center', paddingHorizontal: 20 },
  btnSecondaryText: { color: '#374151', fontSize: 15, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 10 },
  recipientCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f9fafb', borderRadius: 14, padding: 14, marginBottom: 8 },
  recipientAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  recipientAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  recipientName: { fontSize: 16, fontWeight: '700', color: '#111' },
  recipientSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  successCard: { alignItems: 'center', gap: 10 },
  successIcon: { fontSize: 64 },
  successTitle: { fontSize: 22, fontWeight: '700', color: '#111' },
  successSub: { fontSize: 15, color: '#6b7280', textAlign: 'center' },
  txRef: { backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, fontSize: 12, color: '#6b7280', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
});
