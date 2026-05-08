import { useState, useEffect } from 'react';
import { getTransactions } from '../api/wallet';
import { useAuth } from '../context/AuthContext';

const fmt = (n) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format((n || 0) / 100);

const TYPE_ICONS = {
  'peer-to-peer': '💸',
  wallet_funding: '💳',
  bill_payment: '📱',
  airtime: '📞',
  data_bundle: '📶',
  bank_transfer: '🏦',
  refund: '↩️',
};

export default function Transactions() {
  const { user } = useAuth();
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const FILTERS = ['all', 'peer-to-peer', 'wallet_funding', 'bill_payment', 'airtime'];

  useEffect(() => {
    setLoading(true);
    const params = { page, limit: 20 };
    if (filter !== 'all') params.type = filter;
    getTransactions(params)
      .then((res) => {
        const data = res.data.transactions || res.data || [];
        setTxns(page === 1 ? data : (prev) => [...prev, ...data]);
        setHasMore(data.length === 20);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, page]);

  const handleFilter = (f) => {
    setFilter(f);
    setPage(1);
    setTxns([]);
  };

  return (
    <div>
      <h1 style={styles.title}>Transaction History</h1>

      {/* Filter tabs */}
      <div style={styles.filters}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => handleFilter(f)}
            style={{ ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}) }}
          >
            {f === 'all' ? 'All' : f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div style={styles.card}>
        {loading && txns.length === 0 ? (
          <div style={styles.empty}>Loading transactions…</div>
        ) : txns.length === 0 ? (
          <div style={styles.empty}>No transactions found</div>
        ) : (
          txns.map((t, i) => {
            const isDebit = String(t.sender) === String(user?.id);
            return (
              <div
                key={t._id || i}
                style={{ ...styles.row, borderBottom: i < txns.length - 1 ? '1px solid #f3f4f6' : 'none' }}
              >
                <div style={styles.icon}>
                  {TYPE_ICONS[t.type] || '🔄'}
                </div>
                <div style={styles.info}>
                  <div style={styles.desc}>{t.description || t.type?.replace(/_/g, ' ')}</div>
                  <div style={styles.meta}>
                    {new Date(t.createdAt).toLocaleString()} · {t.status}
                  </div>
                </div>
                <div style={{ ...styles.amount, color: isDebit ? '#ef4444' : '#10b981' }}>
                  {isDebit ? '-' : '+'}{fmt(t.amount)}
                </div>
              </div>
            );
          })
        )}

        {hasMore && (
          <button onClick={() => setPage((p) => p + 1)} style={styles.loadMore}>
            Load more
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  title: { fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 20 },
  filters: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  filterBtn: { padding: '8px 16px', border: '1.5px solid #e5e7eb', borderRadius: 20, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'capitalize' },
  filterBtnActive: { border: '1.5px solid #6366f1', background: '#eef2ff', color: '#6366f1' },
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' },
  icon: { fontSize: 22, width: 44, height: 44, background: '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  info: { flex: 1 },
  desc: { fontSize: 14, fontWeight: 600, color: '#111', textTransform: 'capitalize' },
  meta: { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  amount: { fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' },
  empty: { padding: '48px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 15 },
  loadMore: { width: '100%', padding: '16px', background: 'none', border: 'none', color: '#6366f1', fontWeight: 600, cursor: 'pointer', fontSize: 14, borderTop: '1px solid #f3f4f6' },
};
