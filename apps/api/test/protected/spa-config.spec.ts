import {
  FORBIDDEN_PUBLIC_KEY_TOKENS,
  isPublicSpaKey,
  publicSpaConfig,
  SPA_PUBLIC_KEYS,
} from '../../src/config/spa-config';
import { SECRET_KEYS } from '../../src/config/config.schema';
import { makePublicSpaEnv, SYNTHETIC_SERVER_CONFIG } from '../support/factories';

/**
 * Public SPA key allowlist tests (CLP-00-03).
 *
 * Verifies the server→browser projection exposes ONLY the documented,
 * non-secret `VITE_` keys, and structurally rejects anything secret-shaped.
 */

describe('SPA public config allowlist', () => {
  it('exposes only the documented public keys', () => {
    const projected = publicSpaConfig({
      ...makePublicSpaEnv('http://localhost:3000'),
      // Server-only values that MUST NOT cross the boundary:
      POSTGRES_PASSWORD: SYNTHETIC_SERVER_CONFIG.POSTGRES_PASSWORD,
      SESSION_SECRET: SYNTHETIC_SERVER_CONFIG.SESSION_SECRET,
      CSRF_SECRET: SYNTHETIC_SERVER_CONFIG.CSRF_SECRET,
      POSTGRES_HOST: SYNTHETIC_SERVER_CONFIG.POSTGRES_HOST,
    });

    expect(Object.keys(projected)).toEqual(['VITE_API_BASE_URL']);
    expect(projected.VITE_API_BASE_URL).toBe('http://localhost:3000');

    const blob = JSON.stringify(projected);
    expect(blob).not.toContain('synthetic-db-password-value');
    expect(blob).not.toContain('synthetic-session-secret-value');
    expect(blob).not.toContain('synthetic-csrf-secret-value');
  });

  it('omits absent or empty public keys', () => {
    expect(publicSpaConfig({})).toEqual({});
    expect(publicSpaConfig({ VITE_API_BASE_URL: '' })).toEqual({});
  });

  it('isPublicSpaKey accepts a normal public key', () => {
    expect(isPublicSpaKey('VITE_API_BASE_URL')).toBe(true);
  });

  it('isPublicSpaKey rejects keys without the VITE_ prefix', () => {
    expect(isPublicSpaKey('API_PORT')).toBe(false);
    expect(isPublicSpaKey('POSTGRES_PASSWORD')).toBe(false);
  });

  it.each([
    'VITE_POSTGRES_PASSWORD',
    'VITE_DB_PASSWORD',
    'VITE_SESSION_SECRET',
    'VITE_CSRF_TOKEN',
    'VITE_SESSION_ID',
    'VITE_PRIVATE_KEY',
    'VITE_API_KEY',
    'VITE_CREDENTIAL',
  ])('isPublicSpaKey rejects secret-shaped public key %p', (key) => {
    expect(isPublicSpaKey(key)).toBe(false);
  });

  it('isPublicSpaKey rejects a raw secret key even if it were prefixed', () => {
    for (const secret of SECRET_KEYS) {
      expect(isPublicSpaKey(secret)).toBe(false);
    }
  });

  it('the allowlist itself contains no forbidden token', () => {
    for (const key of SPA_PUBLIC_KEYS) {
      const lower = key.toLowerCase();
      for (const token of FORBIDDEN_PUBLIC_KEY_TOKENS) {
        expect(lower).not.toContain(token);
      }
    }
  });
});
