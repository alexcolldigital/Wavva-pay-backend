import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getWallet, getTransactions } from '../api/wallet';

const fmt = (n) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format((n || 0) / 100);

const shortFmt = (n) => {
  const v = (n || 0) / 100;
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₦${(v / 1_000).toFixed(1)}K`;
  return `₦${v.toFixed(2)}`;
};

export default function Dashboard() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getWallet(), getTransactions({ limit: 5 })])
      .then(([wRes, tRes]) => {
        setWallet(wRes.data.wallet || wRes.data);
        setTxns(tRes.data.transactions || tRes.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const balance = wallet?.balance ?? wallet?.wallets?.[0]?.balance ?? 0;

  const quickActions = [
    { label: 'Send Money', icon: '💸', path: '/send', color: '#6366f1' },
    { label: 'Fund Wallet', icon: '💳', path: '/fund', color: '#10b981' },
    { label: 'Pay Bills', icon: '📱', path: '/bills', color: '#f59e0b' },
    { label: 'Bank Transfer', icon: '🏦', path: '/transfer', color: '#3b82f6' },
  ];

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.greeting}>Good day, {user?.firstName} 👋</h1>
          <p style={styles.subGreeting}>Here's your financial overview</p>
        </div>
      </div>

      {/* Balance card */}
      <div style={styles.balanceCard}>
        <div style={styles.balanceLabel}>Total Balance</div>
        {loading ? (
          <div style={styles.balanceSkeleton} />
        ) : (
          <div style={styles.balanceAmount}>{fmt(balance)}</div>
        )}
        {wallet?.virtualAccountNumber && (
          <div style={styles.vaInfo}>
            <span style={styles.vaLabel}>Virtual Account</span>
            <span style={styles.vaNumber}>{wallet.virtualAccountNumber}</span>
            <span style={styles.vaBank}>{wallet.virtualAccountBank}</span>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={styles.sectionTitle}>Quick Actions</div>
      <div style={styles.quickGrid}>
        {quickActions.map((a) => (
          <Link key={a.path} to={a.path} style={{ ...styles.quickCard, background: a.color }}>
            <span style={styles.quickIcon}>{a.icon}</span>
            <span style={styles.quickLabel}>{a.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent transactions */}
      <div style={styles.sectionTitle}>Recent Transactions</div>
      <div style={styles.txnCard}>
        {loading ? (
          <div style={styles.emptyState}>Loading…</div>
        ) : txns.length === 0 ? (
          <div style={styles.emptyState}>No transactions yet. Send or receive money to get started.</div>
        ) : (
          txns.map((t, i) => (
            <div key={t._id || i} style={{ ...styles.txnRow, borderBottom: i < txns.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <div style={styles.txnIcon}>
                {t.type === 'peer-to-peer' ? '💸' : t.type === 'wallet_funding' ? '💳' : t.type === 'bill_payment' ? '📱' : '🔄'}
              </div>
              <div style={styles.txnInfo}>
                <div style={styles.txnDesc}>{t.description || t.type?.replace(/_/g, ' ')}</div>
                <div style={styles.txnDate}>{new Date(t.createdAt).toLocaleDateString()}</div>
              </div>
              <div style={{ ...styles.txnAmount, color: t.sender === user?.id ? '#ef4444' : '#10b981' }}>
                {t.sender === user?.id ? '-' : '+'}{shortFmt(t.amount)}
              </div>
            </div>
          ))
        )}
        {txns.length > 0 && (
          <Link to="/transactions" style={styles.viewAll}>View all transactions →</Link>
        )}
      </div>
    </div>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greeting: { fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 4 },
  subGreeting: { color: '#6b7280', fontSize: 15 },
  balanceCard: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #6366f1 100%)',
    borderRadius: 20, padding: '32px 36px', marginBottom: 28, color: '#fff',
    boxShadow: '0 10px 40px rgba(99,102,241,0.3)',
  },
  balanceLabel: { fontSize: 14, opacity: 0.75, marginBottom: 8, fontWeight: 500 },
  balanceAmount: { fontSize: 42, fontWeight: 800, letterSpacing: '-1px', marginBottom: 16 },
  balanceSkeleton: { height: 48, background: 'rgba(255,255,255,0.15)', borderRadius: 8, marginBottom: 16 },
  vaInfo: { display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 16px' },
  vaLabel: { fontSize: 12, opacity: 0.7 },
  vaNumber: { fontSize: 15, fontWeight: 700, letterSpacing: 1 },
  vaBank: { fontSize: 12, opacity: 0.7 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 14, marginTop: 4 },
  quickGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 },
  quickCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '20px 12px', borderRadius: 16, textDecoration: 'none', gap: 8,
    boxShadow: '0 4px 15px rgba(0,0,0,0.1)', transition: 'transform 0.15s',
  },
  quickIcon: { fontSize: 28 },
  quickLabel: { color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'center' },
  txnCard: { background: '#fff', borderRadius: 16, padding: '8px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  txnRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px' },
  txnIcon: { fontSize: 22, width: 40, height: 40, background: '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 14, fontWeight: 600, color: '#111', textTransform: 'capitalize' },
  txnDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  txnAmount: { fontSize: 15, fontWeight: 700 },
  emptyState: { padding: '32px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14 },
  viewAll: { display: 'block', textAlign: 'center', padding: '14px', color: '#6366f1', fontWeight: 600, fontSize: 14, textDecoration: 'none', borderTop: '1px solid #f3f4f6' },
};
