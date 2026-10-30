/**
 * Login screen (CP-05).
 *
 * Posts credentials to `/auth/login`; the server sets the opaque session
 * cookie plus the CSRF double-submit cookie. Nothing is persisted in web
 * storage and the password is never retained after submit.
 */
import { type FormEvent, useState } from 'react';

import { studentError, ui } from '../ui-vi';
import { ApiError, request, studentApi, type Principal } from '../api/client';

export interface LoginScreenProps {
  onAuthenticated: (principal: Principal) => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [registering, setRegistering] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const principal = registering
        ? (
            await request<{ user: Principal }>('POST', '/auth/register', {
              login: login.trim(),
              password,
              confirmPassword: confirmation,
            })
          ).user
        : await studentApi.login(login.trim(), password);
      setPassword('');
      setConfirmation('');
      onAuthenticated(principal);
    } catch (err) {
      setPassword('');
      setConfirmation('');
      setError(
        registering && err instanceof ApiError && err.code.startsWith('REGISTRATION_')
          ? err.message
          : studentError(
              err,
              registering
                ? 'Không thể đăng ký. Vui lòng thử lại.'
                : 'Không thể đăng nhập. Vui lòng thử lại.',
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="login-heading" className="clp-card">
      <h1 id="login-heading">{registering ? 'Đăng ký học sinh' : ui.login.title}</h1>
      <p className="clp-muted">
        {registering
          ? 'Tạo tài khoản để xin tham gia khóa học. Bạn được đăng nhập ngay và vào học sau khi được duyệt.'
          : 'Đăng nhập bằng tài khoản XueXiHanyu của bạn.'}
      </p>

      {error ? (
        <p className="clp-error" role="alert">
          {error}
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <div className="clp-field">
          <label htmlFor="login-name">{ui.login.login}</label>
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
          <label htmlFor="login-password">{ui.login.passwordLabel}</label>
          <input
            id="login-password"
            className="clp-input"
            name="password"
            type="password"
            autoComplete={registering ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {registering && (
          <div className="clp-field">
            <label htmlFor="signup-confirm">Xác nhận mật khẩu</label>
            <input
              id="signup-confirm"
              className="clp-input"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
            />
            <p className="clp-muted">Tên đăng nhập là email. Mật khẩu từ 8–128 ký tự.</p>
          </div>
        )}
        <div className="clp-actions">
          <button type="submit" className="clp-button" disabled={busy || !login || !password}>
            {busy ? 'Đang xử lý…' : registering ? 'Tạo tài khoản học sinh' : ui.login.title}
          </button>
        </div>
      </form>
      <p>
        <button
          type="button"
          className="clp-button clp-button--secondary"
          disabled={busy}
          onClick={() => {
            setRegistering(!registering);
            setPassword('');
            setConfirmation('');
            setError(null);
          }}
        >
          {registering ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký học sinh'}
        </button>
      </p>
    </section>
  );
}
