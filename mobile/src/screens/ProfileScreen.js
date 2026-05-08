import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';

const TIER_COLORS = ['', '#f59e0b', '#3b82f6', '#10b981'];
const TIER_LABELS = ['', 'Basic', 'Intermediate', 'Full'];

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const tier = user?.kycTier || 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.firstName?.[0]}{user?.lastName?.[0]}</Text>
        </View>
        <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.phone && <Text style={styles.phone}>{user.phone}</Text>}
        <View style={[styles.tierBadge, { backgroundColor: `${TIER_COLORS[tier]}20` }]}>
          <Text style={[styles.tierText, { color: TIER_COLORS[tier] }]}>
            KYC Tier {tier} — {TIER_LABELS[tier]}
          </Text>
        </View>
      </View>

      {/* Info cards */}
      <View style={styles.infoGrid}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>MEMBER SINCE</Text>
          <Text style={styles.infoValue}>{new Date(user?.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>STATUS</Text>
          <Text style={[styles.infoValue, { color: '#10b981' }]}>Active</Text>
        </View>
      </View>

      {/* KYC Tier limits */}
      <Text style={styles.sectionTitle}>Transaction Limits</Text>
      <View style={styles.limitsCard}>
        {[
          { tier: 1, daily: '₦100,000', monthly: '₦500,000' },
          { tier: 2, daily: '₦500,000', monthly: '₦2,000,000' },
          { tier: 3, daily: '₦2,000,000', monthly: '₦10,000,000' },
        ].map((t) => (
          <View key={t.tier} style={[styles.limitRow, t.tier === tier && styles.limitRowActive]}>
            <Text style={[styles.limitTier, { color: TIER_COLORS[t.tier] }]}>Tier {t.tier}</Text>
            <Text style={styles.limitInfo}>Daily: {t.daily}</Text>
            <Text style={styles.limitInfo}>Monthly: {t.monthly}</Text>
            {t.tier === tier && <Text style={styles.currentBadge}>Current</Text>}
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 20, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 4 },
  email: { fontSize: 14, color: '#6b7280', marginBottom: 2 },
  phone: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  tierBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  tierText: { fontSize: 13, fontWeight: '700' },
  infoGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  infoCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  infoLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5, marginBottom: 6 },
  infoValue: { fontSize: 15, fontWeight: '700', color: '#111' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
  limitsCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  limitRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  limitRowActive: { backgroundColor: '#eef2ff' },
  limitTier: { fontSize: 13, fontWeight: '700', width: 50 },
  limitInfo: { fontSize: 12, color: '#6b7280', flex: 1 },
  currentBadge: { fontSize: 10, backgroundColor: '#eef2ff', color: '#6366f1', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, fontWeight: '700' },
  logoutBtn: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 14, padding: 15, alignItems: 'center' },
  logoutText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },
});
