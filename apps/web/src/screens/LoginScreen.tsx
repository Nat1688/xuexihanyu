/**
 * Login screen (CP-05).
 *
 * Posts credentials to `/auth/login`; the server sets the opaque session
 * cookie plus the CSRF double-submit cookie. Nothing is persisted in web
 * storage. Password fields are uncontrolled; credentials are read only on submit.
 */
import { type FormEvent, useRef, useState } from 'react';

import { studentError, ui } from '../ui-vi';
import { ApiError, request, studentApi, type Principal } from '../api/client';
import { WorkspaceBrand } from '../WorkspaceBrand';
import { CulturalWelcome } from '../CulturalWelcome';

export interface LoginScreenProps {
  onAuthenticated: (principal: Principal) => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [registering, setRegistering] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function clearPasswords(form: HTMLFormElement | null) {
    form?.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((input) => {
      input.value = '';
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const login = String(fields.get('login') || '').trim();
    let password = String(fields.get('password') || '');
    let confirmation = String(fields.get('confirmPassword') || '');
    fields.delete('password');
    fields.delete('confirmPassword');
    setError(null);
    if (!login || !password) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const pending = registering
        ? request<{ user: Principal }>('POST', '/auth/register', {
            login,
            password,
            confirmPassword: confirmation,
          }).then((response) => response.user)
        : studentApi.login(login, password);
      // The in-flight request needs the credentials; the component does not.
      password = '';
      confirmation = '';
      const principal = await pending;
      clearPasswords(form);
      onAuthenticated(principal);
    } catch (err) {
      clearPasswords(form);
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
      password = '';
      confirmation = '';
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="login-heading" className="clp-card ink-login">
      <CulturalWelcome />
      <div className="cultural-auth">
        <WorkspaceBrand />
        <p className="ink-eyebrow">Mỗi ngày, hiểu thêm một chút</p>
        <h2 id="login-heading">{registering ? 'Đăng ký học sinh' : ui.login.title}</h2>
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

        <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={busy}>
          <div className="clp-field">
            <label htmlFor="login-name">{ui.login.login}</label>
            <input
              id="login-name"
              className="clp-input"
              name="login"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              readOnly={busy}
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
              readOnly={busy}
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
                name="confirmPassword"
                autoComplete="new-password"
                readOnly={busy}
                required
              />
              <p className="clp-muted">Tên đăng nhập là email. Mật khẩu từ 8–128 ký tự.</p>
            </div>
          )}
          <div className="clp-actions">
            <button type="submit" className="clp-button" disabled={busy}>
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
              clearPasswords(formRef.current);
              setRegistering(!registering);
              setError(null);
            }}
          >
            {registering ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký học sinh'}
          </button>
        </p>
      </div>
    </section>
  );
}
