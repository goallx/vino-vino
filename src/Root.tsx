import App from './App';
import { Kitchen } from './kitchen/Kitchen';
import { Reports } from './analytics/Reports';
import { Orders } from './orders/Orders';
import { Deals } from './deals/Deals';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Login } from './auth/Login';
import { Wordmark } from './components/Wordmark';

/** Minimal path switch, behind an auth gate. */
function Gate() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="splash">
        <Wordmark className="splash__brand" />
      </div>
    );
  }
  if (!user) return <Login />;

  const path = window.location.pathname;
  if (path.startsWith('/kitchen')) return <Kitchen onSignOut={signOut} />;
  if (path.startsWith('/reports')) return <Reports onSignOut={signOut} />;
  if (path.startsWith('/orders')) return <Orders onSignOut={signOut} />;
  if (path.startsWith('/deals') || path.startsWith('/menu')) return <Deals onSignOut={signOut} />;
  return <App username={user.username} onSignOut={signOut} />;
}

export default function Root() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
