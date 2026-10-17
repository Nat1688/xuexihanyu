/**
 * Login screen (CP-05).
 *
 * Posts credentials to `/auth/login`; the server sets the opaque session
 * cookie plus the CSRF double-submit cookie. Nothing is persisted in web
 * storage and the password is never retained after submit.
 */
import { type FormEvent, useState } from 'react';

import { ApiError, studentApi, type Principal } from '../api/client';

export interface LoginScreenProps {
  onAuthenticated: (principal: Principal) => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const principal = await studentApi.login(login.trim(), password);
      setPassword('');
      onAuthenticated(principal);
    } catch (err) {
      setPassword('');
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="login-heading" className="clp-card">
      <h1 id="login-heading">Sign in</h1>
      <p className="clp-muted">Use your Chinese Learning Platform account.</p>

      {error ? (
        <p className="clp-error" role="alert">
          {error}
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <div className="clp-field">
          <label htmlFor="login-name">Login</label>
          <input
            id="login-name"
            className="clp-input"
            name="login"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
        </div>
        <div className="clp-field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            className="clp-input"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="clp-actions">
          <button type="submit" className="clp-button" disabled={busy || !login || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </section>
  );
}
