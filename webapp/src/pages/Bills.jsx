import { useState } from 'react';
import { buyAirtime, buyData, getDataPlans } from '../api/wallet';

const NETWORKS = ['MTN', 'Airtel', 'Glo', '9mobile'];

export default function Bills() {
  const [tab, setTab] = useState('airtime'); // airtime | data
  const [network, setNetwork] = useState('MTN');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadPlans = async (net) => {
    try {
      const res = await getDataPlans({ network: net });
      setPlans(res.data.plans || res.data || []);
    } catch {
      setPlans([]);
    }
  };

  const handleNetworkChange = (net) => {
    setNetwork(net);
    if (tab === 'data') loadPlans(net);
  };

  const handleTabChange = (t) => {
    setTab(t);
    setError(''); setSuccess('');
    if (t === 'data') loadPlans(network);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      if (tab === 'airtime') {
        await buyAirtime({ network, phone, amount: Math.round(parseFloat(amount) * 100) });
        setSuccess(`₦${amount} airtime sent to ${phone}`);
      } else {
        await buyData({ network, phone, planId: selectedPlan?.id, planCode: selectedPlan?.code });
        setSuccess(`${selectedPlan?.name} data sent to ${phone}`);
      }
      setPhone(''); setAmount(''); setSelectedPlan(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={styles.title}>Bills & Airtime</h1>
      <div style={styles.card}>
        {/* Tabs */}
        <div style={styles.tabs}>
          {['airtime', 'data'].map((t) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            >
              {t === 'airtime' ? '📞 Airtime' : '📶 Data'}
            </button>
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Network selector */}
          <label style={styles.label}>Network</label>
          <div style={styles.networkGrid}>
            {NETWORKS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleNetworkChange(n)}
                style={{ ...styles.networkBtn, ...(network === n ? styles.networkBtnActive : {}) }}
              >
                {n}
              </button>
            ))}
          </div>

          <label style={styles.label}>Phone Number</label>
          <input
            style={styles.input}
            type="tel"
            placeholder="08012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />

          {tab === 'airtime' ? (
            <>
              <label style={styles.label}>Amount (₦)</label>
              <input
                style={styles.input}
                type="number"
                min="50"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </>
          ) : (
            <>
              <label style={styles.label}>Select Data Plan</label>
              {plans.length === 0 ? (
                <div style={styles.noPlans}>No plans available for {network}</div>
              ) : (
                <div style={styles.planGrid}>
                  {plans.map((p) => (
                    <button
                      key={p.id || p.code}
                      type="button"
                      onClick={() => setSelectedPlan(p)}
                      style={{ ...styles.planBtn, ...(selectedPlan?.id === p.id ? styles.planBtnActive : {}) }}
                    >
                      <div style={styles.planName}>{p.name || p.size}</div>
                      <div style={styles.planPrice}>₦{(p.price / 100).toLocaleString()}</div>
                      <div style={styles.planValidity}>{p.validity}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <button
            style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
            disabled={loading || (tab === 'data' && !selectedPlan)}
          >
            {loading ? 'Processing…' : tab === 'airtime' ? 'Buy Airtime' : 'Buy Data'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  title: { fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 24 },
  card: { background: '#fff', borderRadius: 20, padding: '32px', maxWidth: 520, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
  tabs: { display: 'flex', gap: 8, marginBottom: 24, background: '#f3f4f6', borderRadius: 12, padding: 4 },
  tab: { flex: 1, padding: '10px', border: 'none', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#6b7280' },
  tabActive: { background: '#fff', color: '#6366f1', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  error: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: 10, fontSize: 14, marginBottom: 12 },
  success: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '12px 16px', borderRadius: 10, fontSize: 14, marginBottom: 12 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  networkGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  networkBtn: { padding: '10px 8px', border: '1.5px solid #e5e7eb', borderRadius: 10, background: '#f9fafb', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' },
  networkBtnActive: { border: '1.5px solid #6366f1', background: '#eef2ff', color: '#6366f1' },
  input: { padding: '13px 16px', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: 15, outline: 'none' },
  planGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 },
  planBtn: { padding: '14px 12px', border: '1.5px solid #e5e7eb', borderRadius: 12, background: '#f9fafb', cursor: 'pointer', textAlign: 'center' },
  planBtnActive: { border: '1.5px solid #6366f1', background: '#eef2ff' },
  planName: { fontSize: 14, fontWeight: 700, color: '#111' },
  planPrice: { fontSize: 13, color: '#6366f1', fontWeight: 600, marginTop: 2 },
  planValidity: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  noPlans: { color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '20px 0' },
  btn: { padding: '14px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
};
