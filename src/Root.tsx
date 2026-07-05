import { lazy, Suspense } from 'react';
import App from './App';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Login } from './auth/Login';
import { Wordmark } from './components/Wordmark';

// Secondary screens are lazy so the order-entry tablet only downloads and
// parses the code it actually uses.
const Kitchen = lazy(() => import('./kitchen/Kitchen').then((m) => ({ default: m.Kitchen })));
const Reports = lazy(() => import('./analytics/Reports').then((m) => ({ default: m.Reports })));
const Orders = lazy(() => import('./orders/Orders').then((m) => ({ default: m.Orders })));
const Deals = lazy(() => import('./deals/Deals').then((m) => ({ default: m.Deals })));

function Splash() {
  return (
    <div className="splash">
      <Wordmark className="splash__brand" />
    </div>
  );
}

/** Minimal path switch, behind an auth gate. */
function Gate() {
  const { user, loading, signOut } = useAuth();

  if (loading) return <Splash />;
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
      <Suspense fallback={<Splash />}>
        <Gate />
      </Suspense>
    </AuthProvider>
  );
}
