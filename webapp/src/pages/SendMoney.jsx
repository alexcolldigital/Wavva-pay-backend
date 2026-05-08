import { useState } from 'react';
import { lookupUser, sendMoney } from '../api/wallet';

export default function SendMoney() {
  const [step, setStep] = useState(1); // 1=lookup, 2=confirm, 3=done
  const [identifier, setIdentifier] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleLookup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await lookupUser(identifier);
      setRecipient(res.data.user || res.data);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'User not found');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await sendMoney({
        recipientIdentifier: identifier,
        amount: Math.round(parseFloat(amount) * 100), // convert to kobo
        description: note,
      });
      setResult(res.data);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.error || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1); setIdentifier(''); setRecipient(null);
    setAmount(''); setNote(''); setResult(null); setError('');
  };

  return (
    <div>
      <h1 style={styles.title}>Send Money</h1>
      <div style={styles.card}>
        {step === 1 && (
          <form onSubmit={handleLookup} style={styles.form}>
            <div style={styles.iconWrap}>💸</div>
            <h2 style={styles.cardTitle}>Who are you sending to?</h2>
            <p style={styles.hint}>Enter email, phone, username, or WavvaTag</p>
            {error && <div style={styles.error}>{error}</div>}
            <input
              style={styles.input}
              placeholder="e.g. @johndoe or john@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
            <button style={styles.btn} disabled={loading}>
              {loading ? 'Looking up…' : 'Find recipient →'}
            </button>
          </form>
        )}

        {step === 2 && recipient && (
          <form onSubmit={handleSend} style={styles.form}>
            <div style={styles.recipientCard}>
              <div style={styles.recipientAvatar}>
                {recipient.firstName?.[0]}{recipient.lastName?.[0]}
              </div>
              <div>
                <div style={styles.recipientName}>{recipient.firstName} {recipient.lastName}</div>
                <div style={styles.recipientSub}>{recipient.email || recipient.phone}</div>
              </div>
            </div>
            {error && <div style={styles.error}>{error}</div>}
            <label style={styles.label}>Amount (₦)</label>
            <input
              style={styles.input}
              type="number"
              min="1"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <label style={styles.label}>Note (optional)</label>
            <input
              style={styles.input}
              placeholder="What's this for?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div style={styles.btnRow}>
              <button type="button" onClick={() => setStep(1)} style={styles.btnSecondary}>← Back</button>
              <button style={styles.btn} disabled={loading}>
                {loading ? 'Sending…' : `Send ₦${amount || '0'}`}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div style={styles.successWrap}>
            <div style={styles.successIcon}>✅</div>
            <h2 style={styles.successTitle}>Transfer Successful!</h2>
            <p style={styles.successSub}>
              ₦{(result?.amount / 100 || parseFloat(amount)).toFixed(2)} sent to {recipient?.firstName}
            </p>
            <div style={styles.txRef}>Ref: {result?.transactionId || result?._id || 'N/A'}</div>
            <button onClick={reset} style={styles.btn}>Send another</button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  title: { fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 24 },
  card: { background: '#fff', borderRadius: 20, padding: '40px', maxWidth: 480, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  iconWrap: { fontSize: 48, textAlign: 'center' },
  cardTitle: { fontSize: 22, fontWeight: 700, color: '#111', textAlign: 'center' },
  hint: { color: '#6b7280', textAlign: 'center', fontSize: 14 },
  error: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: 10, fontSize: 14 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: { padding: '13px 16px', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: 15, outline: 'none' },
  btn: { padding: '14px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { padding: '14px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  btnRow: { display: 'flex', gap: 12 },
  recipientCard: { display: 'flex', alignItems: 'center', gap: 14, background: '#f9fafb', borderRadius: 14, padding: '16px 20px' },
  recipientAvatar: { width: 48, height: 48, borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 },
  recipientName: { fontSize: 16, fontWeight: 700, color: '#111' },
  recipientSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  successWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0' },
  successIcon: { fontSize: 64 },
  successTitle: { fontSize: 24, fontWeight: 700, color: '#111' },
  successSub: { color: '#6b7280', fontSize: 15 },
  txRef: { background: '#f3f4f6', padding: '8px 16px', borderRadius: 8, fontSize: 13, color: '#6b7280', fontFamily: 'monospace' },
};
