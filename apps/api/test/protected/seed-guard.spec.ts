/**
 * CLP-00-11 — Seed/bootstrap guard & synthetic-namespace unit tests (pure).
 *
 * These tests exercise the guard LOGIC only: no database, no network, no Nest.
 * They assert the safety contract the CLP-00-11 task fixes:
 *
 *   - the synthetic seed is refused for any non-local / non-clp_dev / non-clp_test
 *     target, and allowed only for a local clp_dev/clp_test;
 *   - synthetic logins are confined to the reserved `example.invalid` namespace;
 *   - the ADMIN bootstrap is refused when the login is missing, when the secret
 *     is missing/too short, or when the target host is non-local;
 *   - the bootstrap is refused whenever any ADMIN membership already exists;
 *   - the deterministic fixtures use only approved roles/states and carry NO
 *     committed plaintext password.
 *
 * The modules under test live outside the API workspace (repo `scripts/seed/`),
 * so they are required via relative CommonJS imports — they are dependency-free
 * and perform no I/O.
 */
import {
  SEEDABLE_DB_NAMES,
  SYNTHETIC_LOGIN_DOMAIN,
  assertSeedable,
  isSyntheticLogin,
  syntheticLogin,
  assertBootstrappable,
  assertNoExistingAdmin,
} from '../../../../scripts/seed/seed-guard.cjs';
import {
  SYNTHETIC_FIXTURES,
  deriveSyntheticPassword,
  resolveFixture,
  resolveAllFixtures,
} from '../../../../scripts/seed/synthetic-fixtures.cjs';
import {
  SCRYPT_PARAMS,
  hashPassword,
  hashParameters,
} from '../../../../scripts/seed/scrypt-hash.cjs';

const DEV_URL = 'postgresql://clp_app:secret@localhost:5432/clp_dev?schema=public';
const TEST_URL = 'postgresql://clp_app:secret@127.0.0.1:5433/clp_test?schema=public';
const PROD_URL = 'postgresql://clp_app:secret@db.example.com:5432/clp_prod?schema=public';
const REMOTE_DEV_URL = 'postgresql://clp_app:secret@db.example.com:5432/clp_dev?schema=public';
const OTHER_LOCAL_URL = 'postgresql://clp_app:secret@localhost:5432/other_db?schema=public';

describe('assertSeedable', () => {
  it('allows a local clp_dev target', () => {
    const decision = assertSeedable(DEV_URL);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.target).toContain('clp_dev');
  });

  it('allows a local clp_test target', () => {
    const decision = assertSeedable(TEST_URL);
    expect(decision.allowed).toBe(true);
  });

  it('refuses a non-CLP local database', () => {
    const decision = assertSeedable(OTHER_LOCAL_URL);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/only clp_dev, clp_test/);
  });

  it('refuses a non-local host even when the db name looks right', () => {
    const decision = assertSeedable(REMOTE_DEV_URL);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/non-local/);
  });

  it('refuses a malformed/absent URL', () => {
    expect(assertSeedable(undefined).allowed).toBe(false);
    expect(assertSeedable('not-a-url').allowed).toBe(false);
  });

  it('never echoes the password in the refusal target', () => {
    const decision = assertSeedable(PROD_URL);
    expect(decision.allowed).toBe(false);
    expect(decision.target).not.toContain('secret');
  });

  it('exposes exactly clp_dev and clp_test as seedable names', () => {
    expect([...SEEDABLE_DB_NAMES]).toEqual(['clp_dev', 'clp_test']);
  });
});

describe('synthetic login namespace', () => {
  it('uses the reserved example.invalid domain', () => {
    expect(SYNTHETIC_LOGIN_DOMAIN).toBe('example.invalid');
  });

  it('builds logins inside the reserved namespace', () => {
    expect(syntheticLogin('student.one')).toBe('student.one@example.invalid');
  });

  it('rejects an empty/embedded-@ local part', () => {
    expect(() => syntheticLogin('')).toThrow();
    expect(() => syntheticLogin('a@b')).toThrow();
  });

  it('recognises only in-namespace logins', () => {
    expect(isSyntheticLogin('x@example.invalid')).toBe(true);
    expect(isSyntheticLogin('x@EXAMPLE.INVALID')).toBe(true);
    expect(isSyntheticLogin('x@example.com')).toBe(false);
    expect(isSyntheticLogin('x')).toBe(false);
    expect(isSyntheticLogin('@example.invalid')).toBe(false);
    expect(isSyntheticLogin(undefined)).toBe(false);
  });

  it('every frozen fixture login is in the reserved namespace', () => {
    for (const f of resolveAllFixtures()) {
      expect(isSyntheticLogin(f.login)).toBe(true);
    }
  });
});

describe('assertBootstrappable', () => {
  const okLogin = 'owner@clp.example.org';
  const okSecret = 'correct-horse-battery-staple';

  it('allows a local target with a login and a long-enough secret', () => {
    const decision = assertBootstrappable({ url: DEV_URL, login: okLogin, password: okSecret });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.login).toBe(okLogin);
  });

  it('refuses a missing login', () => {
    const decision = assertBootstrappable({ url: DEV_URL, login: undefined, password: okSecret });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/CLP_BOOTSTRAP_ADMIN_LOGIN/);
  });

  it('refuses a blank login', () => {
    expect(assertBootstrappable({ url: DEV_URL, login: '   ', password: okSecret }).allowed).toBe(
      false,
    );
  });

  it('refuses a missing or too-short secret', () => {
    expect(
      assertBootstrappable({ url: DEV_URL, login: okLogin, password: undefined }).allowed,
    ).toBe(false);
    expect(assertBootstrappable({ url: DEV_URL, login: okLogin, password: 'short' }).allowed).toBe(
      false,
    );
  });

  it('refuses a non-local host', () => {
    const decision = assertBootstrappable({
      url: REMOTE_DEV_URL,
      login: okLogin,
      password: okSecret,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/non-local/);
  });

  it('never echoes the secret in a refusal target', () => {
    const decision = assertBootstrappable({
      url: 'postgresql://clp_app:supersecret@db.example.com:5432/clp_dev',
      login: okLogin,
      password: okSecret,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.target).not.toContain('supersecret');
  });
});

describe('assertNoExistingAdmin', () => {
  it('allows bootstrap only when no admin exists', () => {
    expect(assertNoExistingAdmin({ existingAdminCount: 0 }).allowed).toBe(true);
  });

  it('refuses when at least one admin membership exists', () => {
    const decision = assertNoExistingAdmin({ existingAdminCount: 1 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/already exists/);
  });

  it('fails safe on an unknown count', () => {
    expect(assertNoExistingAdmin({ existingAdminCount: Number.NaN }).allowed).toBe(false);
    expect(assertNoExistingAdmin({ existingAdminCount: -1 }).allowed).toBe(false);
  });
});

describe('synthetic fixtures', () => {
  const APPROVED_ROLES = new Set(['ADMIN', 'TEACHER', 'STUDENT']);
  const APPROVED_STATES = new Set(['PENDING', 'ACTIVE', 'DISABLED']);

  it('uses only approved roles and states', () => {
    for (const f of SYNTHETIC_FIXTURES) {
      for (const role of f.roles) expect(APPROVED_ROLES.has(role)).toBe(true);
      expect(APPROVED_STATES.has(f.state)).toBe(true);
    }
  });

  it('is deterministic: the same key re-derives the same password', () => {
    expect(deriveSyntheticPassword('student.one')).toBe(deriveSyntheticPassword('student.one'));
    expect(deriveSyntheticPassword('student.one')).not.toBe(deriveSyntheticPassword('student.two'));
  });

  it('carries no committed plaintext password field', () => {
    for (const f of SYNTHETIC_FIXTURES) {
      expect(Object.prototype.hasOwnProperty.call(f, 'password')).toBe(false);
    }
  });

  it('resolveFixture yields an in-namespace login and a derived password', () => {
    const resolved = resolveFixture({ key: 'admin', roles: ['ADMIN'], state: 'ACTIVE' });
    expect(resolved.login).toBe('admin@example.invalid');
    expect(resolved.password).toBe(deriveSyntheticPassword('admin'));
  });

  it('resolveAllFixtures covers every frozen fixture exactly once', () => {
    const all = resolveAllFixtures();
    expect(all).toHaveLength(SYNTHETIC_FIXTURES.length);
    const keys = all.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('scrypt-hash helper', () => {
  it('emits the API-verifiable encoded format with the exact parameters', () => {
    const encoded = hashPassword('synthetic-password-0000');
    expect(encoded).toMatch(/^scrypt\$N=32768,r=8,p=1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it('never embeds the plaintext and uses a fresh random salt', () => {
    const plain = 'synthetic-password-0000';
    const a = hashPassword(plain);
    const b = hashPassword(plain);
    expect(a).not.toContain(plain);
    expect(b).not.toContain(plain);
    expect(a).not.toBe(b);
  });

  it('persists numeric parameters matching the API defaults', () => {
    const params = hashParameters();
    expect(params).toEqual({
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      keylen: SCRYPT_PARAMS.keylen,
    });
  });

  it('rejects an empty plaintext', () => {
    expect(() => hashPassword('')).toThrow();
  });
});
