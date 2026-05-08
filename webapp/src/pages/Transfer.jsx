import { useState, useEffect } from 'react';
import { getBanks, resolveAccount, bankTransfer } from '../api/wallet';

export default function Transfer() {
  const [banks, setBanks] = useState([]);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getBanks().then((res) => setBanks(res.data.banks || res.data || [])).catch(() => {});
  }, []);

  const handleResolve = async () => {
    if (accountNumber.length !== 10 || !bankCode) return;
    setResolving(true);
    setAccountName('');
    try {
      const res = await resolveAccount({ accountNumber, bankCode });
      setAccountName(res.data.accountName || res.data.account_name || '');
    } catch {
      setAccountName('');
    } finally {
      setResolving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      await bankTransfer({
        bankCode,
        accountNumber,
        accountName,
        amount: Math.round(parseFloat(amount) * 100),
        narration: note,
      });
      setSuccess(`₦${amount} transferred to ${accountName} successfully`);
      setAccountNumber(''); setAccountName(''); setAmount(''); setNote('');
    } catch (err) {
      setError(err.response?.data?.error || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={styles.title}>Bank Transfer</h1>
      <div style={styles.card}>
        <div style={styles.iconWrap}>🏦</div>
        <h2 style={styles.cardTitle}>Transfer to any bank</h2>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Select Bank</label>
          <select
            style={styles.input}
            value={bankCode}
            onChange={(e) => { setBankCode(e.target.value); setAccountName(''); }}
            required
          >
            <option value="">-- Select bank --</option>
            {banks.map((b) => (
              <option key={b.code || b.id} value={b.code}>{b.name}</option>
            ))}
          </select>

          <label style={styles.label}>Account Number</label>
          <input
            style={styles.input}
            type="text"
            maxLength={10}
            placeholder="10-digit account number"
            value={accountNumber}
            onChange={(e) => { setAccountNumber(e.target.value); setAccountName(''); }}
            onBlur={handleResolve}
            required
          />

          {resolving && <div style={styles.resolving}>Verifying account…</div>}
          {accountName && (
            <div style={styles.accountName}>✅ {accountName}</div>
          )}

          <label style={styles.label}>Amount (₦)</label>
          <input
            style={styles.input}
            type="number"
            min="100"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          <label style={styles.label}>Narration (optional)</label>
          <input
            style={styles.input}
            placeholder="What's this for?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <button
            style={{ ...styles.btn, opacity: loading || !accountName ? 0.7 : 1 }}
            disabled={loading || !accountName}
          >
            {loading ? 'Transferring…' : 'Transfer'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  title: { fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 24 },
  card: { background: '#fff', borderRadius: 20, padding: '40px', maxWidth: 480, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: 4 },
  iconWrap: { fontSize: 48, textAlign: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 22, fontWeight: 700, color: '#111', textAlign: 'center', marginBottom: 16 },
  error: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: 10, fontSize: 14 },
  success: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '12px 16px', borderRadius: 10, fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 6 },
  input: { padding: '13px 16px', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' },
  resolving: { fontSize: 13, color: '#6b7280', fontStyle: 'italic' },
  accountName: { fontSize: 14, fontWeight: 700, color: '#10b981', background: '#f0fdf4', padding: '10px 14px', borderRadius: 10 },
  btn: { padding: '14px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 8 },
};
