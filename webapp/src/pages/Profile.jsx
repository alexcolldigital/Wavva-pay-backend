import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { kycUpgrade } from '../api/auth';

export default function Profile() {
  const { user, logout } = useAuth();
  const [kycForm, setKycForm] = useState({ bvn: '', nin: '', targetTier: 2 });
  const [kycLoading, setKycLoading] = useState(false);
  const [kycMsg, setKycMsg] = useState('');
  const [kycError, setKycError] = useState('');

  const handleKYC = async (e) => {
    e.preventDefault();
    setKycMsg(''); setKycError('');
    setKycLoading(true);
    try {
      const res = await kycUpgrade(kycForm);
      setKycMsg(`KYC upgraded to Tier ${res.data.kycTier} successfully!`);
    } catch (err) {
      setKycError(err.response?.data?.error || 'KYC upgrade failed');
    } finally {
      setKycLoading(false);
    }
  };

  const tierLabel = (t) => ['', 'Basic', 'Intermediate', 'Full'][t] || 'Unknown';
  const tierColor = (t) => ['', '#f59e0b', '#3b82f6', '#10b981'][t] || '#6b7280';

  return (
    <div>
      <h1 style={styles.title}>Profile</h1>

      <div style={styles.grid}>
        {/* User info card */}
        <div style={styles.card}>
          <div style={styles.avatarWrap}>
            <div style={styles.avatar}>{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
          </div>
          <h2 style={styles.name}>{user?.firstName} {user?.lastName}</h2>
          <p style={styles.email}>{user?.email}</p>
          {user?.phone && <p style={styles.phone}>{user.phone}</p>}

          <div style={styles.tierBadge(tierColor(user?.kycTier))}>
            KYC Tier {user?.kycTier || 1} — {tierLabel(user?.kycTier || 1)}
          </div>

          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <div style={styles.infoLabel}>Member since</div>
              <div style={styles.infoValue}>{new Date(user?.createdAt).toLocaleDateString()}</div>
            </div>
            <div style={styles.infoItem}>
              <div style={styles.infoLabel}>Account status</div>
              <div style={{ ...styles.infoValue, color: '#10b981' }}>Active</div>
            </div>
          </div>
        </div>

        {/* KYC upgrade card */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Upgrade KYC Tier</h3>
          <p style={styles.cardSub}>Higher tiers unlock larger transaction limits</p>

          <div style={styles.tierTable}>
            {[
              { tier: 1, daily: '₦100,000', monthly: '₦500,000' },
              { tier: 2, daily: '₦500,000', monthly: '₦2,000,000' },
              { tier: 3, daily: '₦2,000,000', monthly: '₦10,000,000' },
            ].map((t) => (
              <div key={t.tier} style={{ ...styles.tierRow, background: user?.kycTier === t.tier ? '#eef2ff' : '#f9fafb' }}>
                <div style={styles.tierNum(tierColor(t.tier))}>Tier {t.tier}</div>
                <div style={styles.tierLimits}>
                  <span>Daily: {t.daily}</span>
                  <span>Monthly: {t.monthly}</span>
                </div>
                {user?.kycTier === t.tier && <span style={styles.currentBadge}>Current</span>}
              </div>
            ))}
          </div>

          {kycMsg && <div style={styles.success}>{kycMsg}</div>}
          {kycError && <div style={styles.error}>{kycError}</div>}

          <form onSubmit={handleKYC} style={styles.form}>
            <label style={styles.label}>BVN (11 digits)</label>
            <input
              style={styles.input}
              placeholder="Enter your BVN"
              value={kycForm.bvn}
              onChange={(e) => setKycForm({ ...kycForm, bvn: e.target.value })}
              maxLength={11}
            />
            <label style={styles.label}>NIN (11 digits)</label>
            <input
              style={styles.input}
              placeholder="Enter your NIN"
              value={kycForm.nin}
              onChange={(e) => setKycForm({ ...kycForm, nin: e.target.value })}
              maxLength={11}
            />
            <label style={styles.label}>Target Tier</label>
            <select
              style={styles.input}
              value={kycForm.targetTier}
              onChange={(e) => setKycForm({ ...kycForm, targetTier: parseInt(e.target.value) })}
            >
              <option value={2}>Tier 2 — Intermediate</option>
              <option value={3}>Tier 3 — Full</option>
            </select>
            <button style={styles.btn} disabled={kycLoading}>
              {kycLoading ? 'Upgrading…' : 'Upgrade KYC'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles = {
  title: { fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 24 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' },
  card: { background: '#fff', borderRadius: 20, padding: '32px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
  avatarWrap: { display: 'flex', justifyContent: 'center', marginBottom: 16 },
  avatar: { width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700 },
  name: { fontSize: 22, fontWeight: 700, color: '#111', textAlign: 'center', marginBottom: 4 },
  email: { color: '#6b7280', textAlign: 'center', fontSize: 14, marginBottom: 4 },
  phone: { color: '#6b7280', textAlign: 'center', fontSize: 14, marginBottom: 16 },
  tierBadge: (color) => ({ display: 'inline-block', padding: '6px 16px', borderRadius: 20, background: `${color}20`, color, fontSize: 13, fontWeight: 700, textAlign: 'center', margin: '0 auto 20px', display: 'block', width: 'fit-content', marginLeft: 'auto', marginRight: 'auto' }),
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 },
  infoItem: { background: '#f9fafb', borderRadius: 12, padding: '14px 16px' },
  infoLabel: { fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontWeight: 700, color: '#111', marginTop: 4 },
  cardTitle: { fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 4 },
  cardSub: { color: '#6b7280', fontSize: 13, marginBottom: 20 },
  tierTable: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 },
  tierRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12 },
  tierNum: (color) => ({ fontSize: 13, fontWeight: 700, color, minWidth: 50 }),
  tierLimits: { flex: 1, display: 'flex', gap: 16, fontSize: 12, color: '#6b7280' },
  currentBadge: { fontSize: 11, background: '#eef2ff', color: '#6366f1', padding: '3px 10px', borderRadius: 20, fontWeight: 700 },
  success: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '12px 16px', borderRadius: 10, fontSize: 14, marginBottom: 12 },
  error: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: 10, fontSize: 14, marginBottom: 12 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: { padding: '12px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none' },
  btn: { padding: '13px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
};
