import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import { Login } from './Login';

// In tests no Supabase env is set, so the provider runs in local-fallback mode.
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

describe('auth (local fallback)', () => {
  it('shows the login screen when signed out', async () => {
    renderAuth();
    expect(await screen.findByRole('button', { name: 'התחברות' })).toBeInTheDocument();
  });

  it('rejects wrong credentials with an error', async () => {
    const user = userEvent.setup();
    renderAuth();
    await user.type(screen.getByPlaceholderText('שם משתמש'), 'admin');
    await user.type(screen.getByPlaceholderText('סיסמה'), 'nope');
    await user.click(screen.getByRole('button', { name: 'התחברות' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/שגויים/);
  });

  it('signs in with the correct credentials and persists the session', async () => {
    const user = userEvent.setup();
    const view = renderAuth();
    await user.type(screen.getByPlaceholderText('שם משתמש'), 'admin');
    await user.type(screen.getByPlaceholderText('סיסמה'), 'vinovino');
    await user.click(screen.getByRole('button', { name: 'התחברות' }));

    expect(await screen.findByText(/שלום admin/)).toBeInTheDocument();
    expect(localStorage.getItem('vino:auth')).toContain('admin');

    // a fresh mount restores the session from storage
    view.unmount();
    renderAuth();
    await waitFor(() => expect(screen.getByText(/שלום admin/)).toBeInTheDocument());
  });
});
