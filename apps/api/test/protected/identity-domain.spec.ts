/**
 * Identity domain unit tests (CLP-00-05).
 *
 * Pure, non-database tests over the identity vocabulary: login normalization
 * and unified identity, role validation (exactly three roles), account-state
 * validation, public-id non-guessability, and disabled/pending domain behavior.
 * Synthetic values only; no real user data.
 */
import {
  ACCOUNT_STATES,
  canAuthenticate,
  InvalidLoginError,
  isAccountState,
  isAuthenticatable,
  isPublicUserId,
  isRole,
  makeIdentityUser,
  newPublicUserId,
  normalizeLogin,
  ROLES,
  sameLogin,
  UnknownRoleError,
  validateRoles,
} from '../../src/modules/identity/domain';

describe('login normalization', () => {
  it('trims, lower-cases and NFC-normalizes the identifier', () => {
    expect(normalizeLogin('  Alice@Example.COM  ')).toBe('alice@example.com');
  });

  it('collapses visually identical but differently-composed characters', () => {
    // "é" as e + combining acute vs a single precomposed code point.
    const decomposed = 'e\u0301tudiant';
    const composed = '\u00e9tudiant';
    expect(normalizeLogin(decomposed)).toBe(normalizeLogin(composed));
  });

  it('rejects an empty or whitespace-only login', () => {
    expect(() => normalizeLogin('')).toThrow(InvalidLoginError);
    expect(() => normalizeLogin('   ')).toThrow(InvalidLoginError);
  });

  it('rejects an over-length login', () => {
    expect(() => normalizeLogin('a'.repeat(321))).toThrow(InvalidLoginError);
  });

  it('treats two differently-cased logins as the same identity', () => {
    expect(sameLogin('Teacher.One', 'teacher.one')).toBe(true);
    expect(sameLogin('teacher.one', 'teacher.two')).toBe(false);
  });
});

describe('role validation', () => {
  it('declares exactly the three ADR roles', () => {
    expect([...ROLES]).toEqual(['ADMIN', 'TEACHER', 'STUDENT']);
  });

  it('accepts approved roles and returns a canonical, de-duplicated set', () => {
    expect(validateRoles(['STUDENT', 'ADMIN', 'STUDENT'])).toEqual(['ADMIN', 'STUDENT']);
  });

  it('rejects any value outside the approved three', () => {
    expect(() => validateRoles(['SUPERUSER'])).toThrow(UnknownRoleError);
    expect(() => validateRoles(['ADMIN', 'GUEST'])).toThrow(UnknownRoleError);
    expect(() => validateRoles([42])).toThrow(UnknownRoleError);
  });

  it('type-guards role values', () => {
    expect(isRole('TEACHER')).toBe(true);
    expect(isRole('teacher')).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});

describe('account state', () => {
  it('declares exactly the three approved states', () => {
    expect([...ACCOUNT_STATES]).toEqual(['PENDING', 'ACTIVE', 'DISABLED']);
  });

  it('accepts only approved states', () => {
    expect(isAccountState('ACTIVE')).toBe(true);
    expect(isAccountState('DELETED')).toBe(false);
    expect(isAccountState('active')).toBe(false);
  });

  it('permits authentication only when ACTIVE', () => {
    expect(isAuthenticatable('ACTIVE')).toBe(true);
    expect(isAuthenticatable('PENDING')).toBe(false);
    expect(isAuthenticatable('DISABLED')).toBe(false);
  });
});

describe('public user id', () => {
  it('mints non-guessable v4 UUIDs that validate', () => {
    const a = newPublicUserId();
    const b = newPublicUserId();
    expect(isPublicUserId(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('rejects non-UUID and non-v4 values', () => {
    expect(isPublicUserId('not-a-uuid')).toBe(false);
    expect(isPublicUserId('00000000-0000-1000-8000-000000000000')).toBe(false); // v1
    expect(isPublicUserId(123)).toBe(false);
  });
});

describe('identity user aggregate + disabled-state behavior', () => {
  const base = {
    publicId: newPublicUserId(),
    login: 'Teacher.One',
    roles: ['TEACHER'],
    hasCredential: true,
  } as const;

  it('normalizes the login and freezes the aggregate', () => {
    const user = makeIdentityUser({ ...base, state: 'ACTIVE' });
    expect(user.loginNormalized).toBe('teacher.one');
    expect(Object.isFrozen(user)).toBe(true);
  });

  it('allows an active account with a credential to authenticate', () => {
    expect(canAuthenticate(makeIdentityUser({ ...base, state: 'ACTIVE' }))).toBe(true);
  });

  it('denies a DISABLED account even with a credential', () => {
    expect(canAuthenticate(makeIdentityUser({ ...base, state: 'DISABLED' }))).toBe(false);
  });

  it('denies a PENDING account', () => {
    expect(canAuthenticate(makeIdentityUser({ ...base, state: 'PENDING' }))).toBe(false);
  });

  it('denies an active account with no credential', () => {
    expect(
      canAuthenticate(makeIdentityUser({ ...base, state: 'ACTIVE', hasCredential: false })),
    ).toBe(false);
  });
});
