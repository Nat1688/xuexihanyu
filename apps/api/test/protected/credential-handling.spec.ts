import { randomBytes } from 'node:crypto';
import { ScryptPasswordHasher } from '../../src/modules/identity/infrastructure/scrypt-password-hasher';
import { StructuredLogger } from '../../src/modules/foundation/logging/structured-logger';
import { mapAuthError } from '../../src/modules/identity/http/auth-error-mapper';
import { AuthenticationFailedError } from '../../src/modules/identity/application/auth-errors';

describe('SEC-01 existing backend credential boundaries', () => {
  it('uses salted scrypt and verifies existing encoded hashes without retaining plaintext', async () => {
    const password = randomBytes(24).toString('hex');
    const hasher = new ScryptPasswordHasher();
    const first = await hasher.hash(password);
    const second = await hasher.hash(password);
    expect(first.algorithm).toBe('scrypt');
    expect(first.hash).not.toBe(second.hash);
    expect(JSON.stringify(first)).not.toContain(password);
    expect(await hasher.verify(password, first)).toBe(true);
    expect(await hasher.verify(password + 'different', first)).toBe(false);
  });

  it('redacts password/confirmation/hash-like credential objects and nested errors from structured logs', () => {
    const password = randomBytes(24).toString('hex');
    const lines: string[] = [];
    const logger = new StructuredLogger({ sink: (line) => lines.push(line) });
    logger.event('error', 'synthetic credential rejection', {
      password,
      confirmPassword: password,
      credentials: { hash: password },
      error: new Error(`password=${password}`),
    });
    expect(lines.length).toBe(1);
    expect(lines.join('')).not.toContain(password);
    expect(lines.join('')).toContain('[REDACTED]');
    const mapped = mapAuthError(new AuthenticationFailedError('wrong_password'));
    expect(mapped?.status).toBe(401);
    expect(JSON.stringify(mapped)).not.toContain(password);
    expect(JSON.stringify(mapped)).not.toMatch(/hash|salt|scrypt/u);
  });
});
