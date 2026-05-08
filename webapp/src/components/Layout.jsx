import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { path: '/send', label: 'Send', icon: '💸' },
  { path: '/fund', label: 'Fund', icon: '💳' },
  { path: '/bills', label: 'Bills', icon: '📱' },
  { path: '/transactions', label: 'History', icon: '📋' },
  { path: '/profile', label: 'Profile', icon: '👤' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <span style={styles.brandIcon}>⚡</span>
          <span style={styles.brandName}>WavvaPay</span>
        </div>

        <nav style={styles.nav}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                ...styles.navItem,
                ...(location.pathname === item.path ? styles.navItemActive : {}),
              }}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>
            <div style={styles.avatar}>{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
            <div>
              <div style={styles.userName}>{user?.firstName} {user?.lastName}</div>
              <div style={styles.userEmail}>{user?.email}</div>
            </div>
          </div>
          <button onClick={handleLogout} style={styles.logoutBtn}>Sign out</button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles = {
  shell: { display: 'flex', minHeight: '100vh', background: '#f0f2f5' },
  sidebar: {
    width: 240, background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
    display: 'flex', flexDirection: 'column', padding: '24px 0', position: 'fixed',
    top: 0, left: 0, bottom: 0, zIndex: 100,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px 32px' },
  brandIcon: { fontSize: 28 },
  brandName: { color: '#fff', fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px' },
  nav: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '0 12px' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
    borderRadius: 10, color: 'rgba(255,255,255,0.65)', textDecoration: 'none',
    fontSize: 15, fontWeight: 500, transition: 'all 0.15s',
  },
  navItemActive: {
    background: 'rgba(99,102,241,0.25)', color: '#a5b4fc',
  },
  navIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  sidebarFooter: { padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' },
  userInfo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: {
    width: 36, height: 36, borderRadius: '50%', background: '#6366f1',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, flexShrink: 0,
  },
  userName: { color: '#fff', fontSize: 13, fontWeight: 600 },
  userEmail: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  logoutBtn: {
    width: '100%', padding: '8px 0', background: 'rgba(239,68,68,0.15)',
    color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 500,
  },
  main: { marginLeft: 240, flex: 1, padding: 32, minHeight: '100vh' },
};
