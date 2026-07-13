import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Wordmark } from './components/Wordmark';
import { ConfirmProvider } from './components/ConfirmDialog';

// Every post-auth surface is lazy. The auth check stays tiny, and each tablet
// only parses the screen it actually runs (entry, kitchen, reports, or admin).
const App = lazy(() => import('./App'));
const Login = lazy(() => import('./auth/Login').then((m) => ({ default: m.Login })));
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
  const { user, loading } = useAuth();

  if (loading) return <Splash />;
  if (!user) return <Login />;

  const path = window.location.pathname;
  if (path.startsWith('/kitchen')) return <Kitchen />;
  if (path.startsWith('/reports')) return <Reports />;
  if (path.startsWith('/orders')) return <Orders />;
  if (path.startsWith('/deals') || path.startsWith('/menu')) return <Deals />;
  return <App username={user.username} />;
}

export default function Root() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <Suspense fallback={<Splash />}>
          <Gate />
        </Suspense>
      </ConfirmProvider>
    </AuthProvider>
  );
}
