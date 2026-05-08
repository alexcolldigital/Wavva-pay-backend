import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getWallet, getTransactions } from '../api/wallet';

const fmt = (n) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format((n || 0) / 100);

const TYPE_ICONS = {
  'peer-to-peer': '💸', wallet_funding: '💳', bill_payment: '📱',
  airtime: '📞', data_bundle: '📶', refund: '↩️',
};

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [wRes, tRes] = await Promise.all([getWallet(), getTransactions({ limit: 5 })]);
      setWallet(wRes.data.wallet || wRes.data);
      setTxns(tRes.data.transactions || tRes.data || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  const balance = wallet?.balance ?? wallet?.wallets?.[0]?.balance ?? 0;

  const quickActions = [
    { label: 'Send', icon: '💸', screen: 'Send', color: '#6366f1' },
    { label: 'Fund', icon: '💳', screen: 'Fund', color: '#10b981' },
    { label: 'Bills', icon: '📱', screen: 'Bills', color: '#f59e0b' },
    { label: 'History', icon: '📋', screen: 'Transactions', color: '#3b82f6' },
  ];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#6366f1" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good day, {user?.firstName} 👋</Text>
          <Text style={styles.subGreeting}>Your financial overview</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.avatarBtn}>
          <Text style={styles.avatarText}>{user?.firstName?.[0]}{user?.lastName?.[0]}</Text>
        </TouchableOpacity>
      </View>

      {/* Balance card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Total Balance</Text>
        {loading ? (
          <ActivityIndicator color="#fff" size="large" style={{ marginVertical: 12 }} />
        ) : (
          <Text style={styles.balanceAmount}>{fmt(balance)}</Text>
        )}
        {wallet?.virtualAccountNumber && (
          <View style={styles.vaRow}>
            <Text style={styles.vaLabel}>Virtual Account: </Text>
            <Text style={styles.vaNumber}>{wallet.virtualAccountNumber}</Text>
          </View>
        )}
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickGrid}>
        {quickActions.map((a) => (
          <TouchableOpacity
            key={a.screen}
            style={[styles.quickCard, { backgroundColor: a.color }]}
            onPress={() => navigation.navigate(a.screen)}
          >
            <Text style={styles.quickIcon}>{a.icon}</Text>
            <Text style={styles.quickLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent transactions */}
      <Text style={styles.sectionTitle}>Recent Transactions</Text>
      <View style={styles.txnCard}>
        {loading ? (
          <ActivityIndicator color="#6366f1" style={{ padding: 24 }} />
        ) : txns.length === 0 ? (
          <Text style={styles.emptyText}>No transactions yet</Text>
        ) : (
          txns.map((t, i) => (
            <View key={t._id || i} style={[styles.txnRow, i < txns.length - 1 && styles.txnBorder]}>
              <View style={styles.txnIcon}>
                <Text style={{ fontSize: 18 }}>{TYPE_ICONS[t.type] || '🔄'}</Text>
              </View>
              <View style={styles.txnInfo}>
                <Text style={styles.txnDesc} numberOfLines={1}>
                  {t.description || t.type?.replace(/_/g, ' ')}
                </Text>
                <Text style={styles.txnDate}>{new Date(t.createdAt).toLocaleDateString()}</Text>
              </View>
              <Text style={[styles.txnAmount, { color: String(t.sender) === String(user?.id) ? '#ef4444' : '#10b981' }]}>
                {String(t.sender) === String(user?.id) ? '-' : '+'}{fmt(t.amount)}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 16 },
  greeting: { fontSize: 22, fontWeight: '700', color: '#111' },
  subGreeting: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  avatarBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  balanceCard: {
    margin: 16, marginTop: 4, borderRadius: 20, padding: 24,
    backgroundColor: '#1a1a2e',
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: -1, marginBottom: 14 },
  vaRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 },
  vaLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  vaNumber: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginHorizontal: 16, marginBottom: 12, marginTop: 8 },
  quickGrid: { flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 20 },
  quickCard: { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', gap: 6 },
  quickIcon: { fontSize: 24 },
  quickLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
  txnCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  txnRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  txnBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  txnIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 14, fontWeight: '600', color: '#111', textTransform: 'capitalize' },
  txnDate: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  txnAmount: { fontSize: 14, fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#9ca3af', padding: 24, fontSize: 14 },
});
