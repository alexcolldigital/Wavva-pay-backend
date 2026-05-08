import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { getTransactions } from '../api/wallet';
import { useAuth } from '../context/AuthContext';

const fmt = (n) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format((n || 0) / 100);

const TYPE_ICONS = {
  'peer-to-peer': '💸', wallet_funding: '💳', bill_payment: '📱',
  airtime: '📞', data_bundle: '📶', refund: '↩️',
};

export default function TransactionsScreen() {
  const { user } = useAuth();
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = async (p = 1, reset = false) => {
    try {
      const res = await getTransactions({ page: p, limit: 20 });
      const data = res.data.transactions || res.data || [];
      setTxns(reset ? data : (prev) => [...prev, ...data]);
      setHasMore(data.length === 20);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(1, true); }, []);

  const renderItem = ({ item: t, index }) => {
    const isDebit = String(t.sender) === String(user?.id);
    return (
      <View style={[styles.row, index > 0 && styles.rowBorder]}>
        <View style={styles.icon}>
          <Text style={{ fontSize: 18 }}>{TYPE_ICONS[t.type] || '🔄'}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.desc} numberOfLines={1}>
            {t.description || t.type?.replace(/_/g, ' ')}
          </Text>
          <Text style={styles.meta}>
            {new Date(t.createdAt).toLocaleDateString()} · {t.status}
          </Text>
        </View>
        <Text style={[styles.amount, { color: isDebit ? '#ef4444' : '#10b981' }]}>
          {isDebit ? '-' : '+'}{fmt(t.amount)}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {loading && txns.length === 0 ? (
        <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={txns}
          keyExtractor={(t, i) => t._id || String(i)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); setPage(1); load(1, true); }}
              tintColor="#6366f1"
            />
          }
          ListEmptyComponent={<Text style={styles.empty}>No transactions yet</Text>}
          onEndReached={() => {
            if (hasMore) {
              const next = page + 1;
              setPage(next);
              load(next);
            }
          }}
          onEndReachedThreshold={0.3}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  list: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, backgroundColor: '#fff', paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  desc: { fontSize: 14, fontWeight: '600', color: '#111', textTransform: 'capitalize' },
  meta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 48, fontSize: 15 },
});
