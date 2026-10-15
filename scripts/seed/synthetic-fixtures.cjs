#!/usr/bin/env node
/**
 * CLP-00-11 — Deterministic synthetic fixtures for the local seed.
 *
 * The fixture LIST (logins, roles, account states) is frozen here so a rerun
 * always produces the SAME identifiers. Passwords are NOT stored as literals:
 * they are DERIVED at runtime by {@link deriveSyntheticPassword} from the
 * fixture key plus a fixed, non-secret salt. This keeps the source free of any
 * committed credential while remaining fully deterministic (so idempotency tests
 * can recompute them).
 *
 * Everything created by the seed lives in the reserved `example.invalid`
 * namespace (see seed-guard.cjs) and carries only SYNTHETIC roles/state — no
 * domain content (no profile/class/enrollment/content/exercise data).
 */
'use strict';

const { syntheticLogin } = require('./seed-guard.cjs');

/**
 * Fixed, non-secret salt mixed into every derived synthetic password. Its value
 * is irrelevant to safety (the accounts are inert and namespace-reserved); it
 * exists only so the derived password is not a bare library constant.
 */
const SYNTHETIC_SALT = 'clp-00-11-synthetic-seed';

/**
 * The frozen fixture set. Each entry is a named, synthetic identity:
 *   - `key`    stable fixture identifier (also the login local part);
 *   - `roles`  the exact `UserRole` memberships to ensure;
 *   - `state`  the approved `AccountState`.
 *
 * Keys are deliberately functional, not personal, and contain no domain data.
 */
const SYNTHETIC_FIXTURES = Object.freeze([
  { key: 'admin', roles: ['ADMIN'], state: 'ACTIVE' },
  { key: 'teacher.one', roles: ['TEACHER'], state: 'ACTIVE' },
  { key: 'teacher.two', roles: ['TEACHER'], state: 'ACTIVE' },
  { key: 'student.one', roles: ['STUDENT'], state: 'ACTIVE' },
  { key: 'student.two', roles: ['STUDENT'], state: 'ACTIVE' },
  { key: 'student.pending', roles: ['STUDENT'], state: 'PENDING' },
  { key: 'student.disabled', roles: ['STUDENT'], state: 'DISABLED' },
]);

/**
 * Derive the deterministic synthetic password for a fixture key.
 *
 * The value is intentionally obvious and non-secret; it is reproducible from the
 * committed source (no secret is stored). It is only ever used to hash into the
 * local/test database.
 *
 * @param {string} key
 * @returns {string}
 */
function deriveSyntheticPassword(key) {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('deriveSyntheticPassword requires a non-empty key');
  }
  return `${SYNTHETIC_SALT}:${key.trim()}`;
}

/**
 * Resolve a fixture to its full, concrete synthetic identity.
 *
 * @param {{ key: string, roles: string[], state: string }} fixture
 * @returns {{ key: string, login: string, roles: string[], state: string, password: string }}
 */
function resolveFixture(fixture) {
  return {
    key: fixture.key,
    login: syntheticLogin(fixture.key),
    roles: [...fixture.roles],
    state: fixture.state,
    password: deriveSyntheticPassword(fixture.key),
  };
}

/** The concrete synthetic identities the seed will ensure. */
function resolveAllFixtures() {
  return SYNTHETIC_FIXTURES.map(resolveFixture);
}

module.exports = {
  SYNTHETIC_SALT,
  SYNTHETIC_FIXTURES,
  deriveSyntheticPassword,
  resolveFixture,
  resolveAllFixtures,
};
