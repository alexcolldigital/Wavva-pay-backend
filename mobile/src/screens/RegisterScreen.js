import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
  });
  const [loading, setLoading] = useState(false);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleRegister = async () => {
    const { firstName, lastName, email, phone, password } = form;
    if (!firstName || !lastName || !email || !phone || !password) {
      return Alert.alert('Error', 'Please fill in all fields');
    }
    setLoading(true);
    try {
      await register(form);
    } catch (err) {
      Alert.alert('Registration Failed', err.response?.data?.error || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ label, field, ...props }) => (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor="#9ca3af"
        value={form[field]}
        onChangeText={set(field)}
        {...props}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Text style={styles.logoIcon}>⚡</Text>
          <Text style={styles.logoText}>WavvaPay</Text>
        </View>

        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Nigeria's social payment platform</Text>

        <View style={styles.form}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>First name</Text>
              <TextInput style={styles.input} placeholder="John" placeholderTextColor="#9ca3af" value={form.firstName} onChangeText={set('firstName')} />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Last name</Text>
              <TextInput style={styles.input} placeholder="Doe" placeholderTextColor="#9ca3af" value={form.lastName} onChangeText={set('lastName')} />
            </View>
          </View>

          <Text style={styles.label}>Email address</Text>
          <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor="#9ca3af" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={set('email')} />

          <Text style={styles.label}>Phone number</Text>
          <TextInput style={styles.input} placeholder="+2348012345678" placeholderTextColor="#9ca3af" keyboardType="phone-pad" value={form.phone} onChangeText={set('phone')} />

          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor="#9ca3af" secureTextEntry value={form.password} onChangeText={set('password')} />

          <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.footer}>
            Already have an account? <Text style={styles.link}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logoIcon: { fontSize: 48 },
  logoText: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 6 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 24 },
  form: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 20 },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 5, marginTop: 10 },
  input: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, padding: 13, fontSize: 14, color: '#111', backgroundColor: '#fafafa' },
  btn: { marginTop: 18, backgroundColor: '#6366f1', borderRadius: 14, padding: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  link: { color: '#a5b4fc', fontWeight: '700' },
});
