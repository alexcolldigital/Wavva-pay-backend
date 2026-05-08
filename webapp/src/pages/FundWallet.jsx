import { useState } from 'react';
import { fundWallet } from '../api/wallet';
import { useAuth } from '../context/AuthContext';

export default function FundWallet() {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payLink, setPayLink] = useState('');

  const quickAmounts = [1000, 2000, 5000, 10000, 20000, 50000];

  const handleFund = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fundWallet({
        amount: Math.round(parseFloat(amount) * 100),
        email: user?.email,
      });
      const link = res.data?.data?.authorization_url || res.data?.data?.link || res.data?.paymentLink;
      if (link) {
        setPayLink(link);
      } else {
        setError('Could not get payment link. Please try again.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  };

  if (payLink) {
    return (
      <div>
        <h1 style={styles.title}>Fund Wallet</h1>
        <div style={styles.card}>
          <div style={styles.iconWrap}>💳</div>
          <h2 style={styles.cardTitle}>Complete Payment</h2>
          <p style={styles.hint}>You'll be redirected to our secure payment page</p>
          <div style={styles.amountDisplay}>₦{parseFloat(amount).toLocaleString()}</div>
          <a href={payLink} target="_blank" rel="noreferrer" style={styles.payBtn}>
            Proceed to Payment →
          </a>
          <button onClick={() => setPayLink('')} style={styles.btnSecondary}>← Change amount</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={styles.title}>Fund Wallet</h1>
      <div style={styles.card}>
        <div style={styles.iconWrap}>💳</div>
        <h2 style={styles.cardTitle}>Add money to your wallet</h2>
        <p style={styles.hint}>Pay with card, bank transfer, or USSD</p>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.quickGrid}>
          {quickAmounts.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAmount(String(a))}
              style={{ ...styles.quickBtn, ...(amount === String(a) ? styles.quickBtnActive : {}) }}
            >
              ₦{a.toLocaleString()}
            </button>
          ))}
        </div>

        <form onSubmit={handleFund} style={styles.form}>
          <label style={styles.label}>Or enter custom amount (₦)</label>
          <input
            style={styles.input}
            type="number"
            min="100"
            step="1"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <button style={styles.btn} disabled={loading}>
            {loading ? 'Initializing…' : 'Fund Wallet'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  title: { fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 24 },
  card: { background: '#fff', borderRadius: 20, padding: '40px', maxWidth: 480, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: 16 },
  iconWrap: { fontSize: 48, textAlign: 'center' },
  cardTitle: { fontSize: 22, fontWeight: 700, color: '#111', textAlign: 'center' },
  hint: { color: '#6b7280', textAlign: 'center', fontSize: 14 },
  error: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: 10, fontSize: 14 },
  quickGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  quickBtn: { padding: '12px 8px', border: '1.5px solid #e5e7eb', borderRadius: 10, background: '#f9fafb', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151' },
  quickBtnActive: { border: '1.5px solid #6366f1', background: '#eef2ff', color: '#6366f1' },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: { padding: '13px 16px', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: 15, outline: 'none' },
  btn: { padding: '14px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer' },
  payBtn: { padding: '14px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'block' },
  btnSecondary: { padding: '12px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  amountDisplay: { fontSize: 36, fontWeight: 800, color: '#111', textAlign: 'center' },
};
