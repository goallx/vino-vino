import { useState } from 'react';
import { useAuth } from './AuthContext';
import { PizzaArt } from '../components/PizzaArt';
import { Wordmark } from '../components/Wordmark';

export function Login() {
  const { signIn, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setError(error);
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__pizza">
          <PizzaArt whole={['t_pepperoni', 't_mushroom', 't_olives', 't_pepper']} size={120} />
        </div>

        <h1 className="login__brand"><Wordmark /></h1>
        <p className="login__sub">מערכת ניהול הזמנות</p>

        <label className="login__field">
          <span>אימייל</span>
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="off"
            autoComplete="email"
            placeholder="name@vinovino.app"
          />
        </label>

        <label className="login__field">
          <span>סיסמה</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="סיסמה"
          />
        </label>

        {error && (
          <p className="login__error" role="alert">{error}</p>
        )}

        <button className="login__submit" type="submit" disabled={busy}>
          {busy ? 'מתחבר…' : 'התחברות'}
        </button>

        {!configured && (
          <p className="login__hint">⚠ חסרה הגדרת חיבור למסד הנתונים — יש למלא את .env</p>
        )}
      </form>
    </div>
  );
}
