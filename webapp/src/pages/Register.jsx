import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      return setError('Passwords do not match');
    }
    setLoading(true);
    try {
      await register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const field = (key, label, type = 'text', placeholder = '') => (
    <div key={key}>
      <label style={styles.label}>{label}</label>
      <input
        style={styles.input}
        type={type}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        required
      />
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>⚡</div>
        <h1 style={styles.title}>Create account</h1>
        <p style={styles.subtitle}>Join WavvaPay — Nigeria's social payment platform</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.row}>
            {field('firstName', 'First name', 'text', 'John')}
            {field('lastName', 'Last name', 'text', 'Doe')}
          </div>
          {field('email', 'Email address', 'email', 'you@example.com')}
          {field('phone', 'Phone number', 'tel', '+2348012345678')}
          {field('password', 'Password', 'password', '••••••••')}
          {field('confirmPassword', 'Confirm password', 'password', '••••••••')}

          <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account?{' '}
          <Link to="/login" style={styles.link}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    padding: '24px 16px',
  },
  card: {
    background: '#fff', borderRadius: 20, padding: '40px 36px', width: '100%',
    maxWidth: 480, boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
  },
  logo: { fontSize: 36, textAlign: 'center', marginBottom: 6 },
  title: { fontSize: 26, fontWeight: 700, textAlign: 'center', color: '#111', marginBottom: 4 },
  subtitle: { color: '#6b7280', textAlign: 'center', marginBottom: 24, fontSize: 14 },
  error: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 14,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 },
  input: {
    width: '100%', padding: '11px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  },
  btn: {
    marginTop: 16, padding: '14px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600,
    cursor: 'pointer',
  },
  footer: { textAlign: 'center', marginTop: 20, color: '#6b7280', fontSize: 14 },
  link: { color: '#6366f1', fontWeight: 600, textDecoration: 'none' },
};
