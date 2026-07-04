import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Supabase Auth is the only sign-in path, so tests run against a mocked
// client: one known account, an in-memory session, real onAuthStateChange
// semantics. The component code under test is exactly what production runs.
const TEST_EMAIL = 'staff@example.com';
const TEST_PASS = 'correct-password';

vi.mock('../lib/supabase', () => {
  type Listener = (event: string, session: { user: { email: string } } | null) => void;
  let session: { user: { email: string } } | null = null;
  const listeners: Listener[] = [];
  return {
    isSupabaseEnabled: true,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session } }),
        onAuthStateChange: (cb: Listener) => {
          listeners.push(cb);
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
          if (email === TEST_EMAIL && password === TEST_PASS) {
            session = { user: { email } };
            listeners.forEach((cb) => cb('SIGNED_IN', session));
            return { error: null };
          }
          return { error: { message: 'Invalid login credentials' } };
        },
        signOut: async () => {
          session = null;
          listeners.forEach((cb) => cb('SIGNED_OUT', null));
        },
      },
    },
  };
});

const { AuthProvider, useAuth } = await import('./AuthContext');
const { Login } = await import('./Login');

function Harness() {
  const { user } = useAuth();
  return user ? <div>שלום {user.username}</div> : <Login />;
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <Harness />
    </AuthProvider>
  );

beforeEach(() => localStorage.clear());

describe('auth (supabase)', () => {
  it('rejects wrong credentials with an error', async () => {
    const user = userEvent.setup();
    renderAuth();
    await user.type(await screen.findByPlaceholderText('name@vinovino.app'), TEST_EMAIL);
    await user.type(screen.getByPlaceholderText('סיסמה'), 'nope');
    await user.click(screen.getByRole('button', { name: 'התחברות' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/שגויים/);
  });

  it('signs in with email + password and restores the session on remount', async () => {
    const user = userEvent.setup();
    const view = renderAuth();
    await user.type(await screen.findByPlaceholderText('name@vinovino.app'), 'Staff@Example.com');
    await user.type(screen.getByPlaceholderText('סיסמה'), TEST_PASS);
    await user.click(screen.getByRole('button', { name: 'התחברות' }));

    expect(await screen.findByText(/שלום staff/)).toBeInTheDocument();

    // a fresh mount restores the session from the auth client
    view.unmount();
    renderAuth();
    await waitFor(() => expect(screen.getByText(/שלום staff/)).toBeInTheDocument());
  });
});
