import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from './AuthContext';
import { PizzaArt } from '../components/PizzaArt';
import { Wordmark } from '../components/Wordmark';

export function Login() {
  const { signIn, mode } = useAuth();
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
      <motion.form
        className="login__card"
        onSubmit={submit}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      >
        <motion.div
          className="login__pizza"
          initial={{ rotate: -12, scale: 0.8, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
        >
          <PizzaArt whole={['t_pepperoni', 't_mushroom', 't_olives', 't_pepper']} size={120} />
        </motion.div>

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
          <motion.p className="login__error" role="alert" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
            {error}
          </motion.p>
        )}

        <motion.button className="login__submit" type="submit" disabled={busy} whileTap={{ scale: 0.98 }}>
          {busy ? 'מתחבר…' : 'התחברות'}
        </motion.button>

        {mode === 'local' && (
          <p className="login__hint">מצב פיתוח · admin@vinovino.app / vinovino</p>
        )}
      </motion.form>
    </div>
  );
}
