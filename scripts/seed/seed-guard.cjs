#!/usr/bin/env node
/**
 * CLP-00-11 — Seed/bootstrap target guard & synthetic-namespace rules (shared
 * library).
 *
 * This module is the single source of truth for deciding WHICH databases a
 * seed/bootstrap command may touch, and WHAT identifiers those commands may
 * create. It performs no I/O and opens no connection: it only classifies and
 * validates, so it is trivially unit-testable (see
 * `apps/api/test/protected/seed-guard.spec.ts`).
 *
 * Safety model (CLP-00-11 acceptance criteria on safety):
 *   - The synthetic seed is allowed ONLY against a recognised LOCAL host whose
 *     database name is exactly `clp_dev` or `clp_test`. Anything else (other
 *     databases, other hosts, malformed URLs) is refused.
 *   - Every synthetic fixture login MUST live under the reserved
 *     `example.invalid` namespace. `example.invalid` is the RFC 2606/6761
 *     reserved domain: it can never be a real deliverable address, so seeded
 *     identities can never leak into a real mail/identity system.
 *   - The production ADMIN bootstrap requires an explicit login supplied via
 *     `CLP_BOOTSTRAP_ADMIN_LOGIN` and a secret read from the git-ignored local
 *     env; nothing is hard-coded.
 *
 * This module never reads/echoes a password: `safeTarget()` (from
 * `scripts/db/db-url.cjs`) redacts credentials so a URL can be printed without
 * leaking a secret value.
 */
'use strict';

const { classifyUrl, safeTarget, DbUrlError } = require('../db/db-url.cjs');

/** Canonical CLP database names seeder commands may target. */
const SEEDABLE_DB_NAMES = Object.freeze(['clp_dev', 'clp_test']);

/** The reserved, non-deliverable login namespace all synthetic fixtures use. */
const SYNTHETIC_LOGIN_DOMAIN = 'example.invalid';

/** The env var that names the single production admin login to bootstrap. */
const BOOTSTRAP_LOGIN_ENV = 'CLP_BOOTSTRAP_ADMIN_LOGIN';

/** The env var that carries the production admin initial password (git-ignored). */
const BOOTSTRAP_PASSWORD_ENV = 'CLP_BOOTSTRAP_ADMIN_PASSWORD';

/** The git-ignored repo-root `.env` file may also hold the bootstrap secret. */
const BOOTSTRAP_PASSWORD_ENV_FILE = 'CLP_BOOTSTRAP_ADMIN_PASSWORD';

/**
 * Decide whether a synthetic seed may run against a URL.
 *
 * Allowed ONLY when the URL parses, its database name is exactly `clp_dev` or
 * `clp_test`, AND its host is a recognised local host. The decision carries a
 * redacted target string for safe logging either way.
 *
 * @param {string|undefined} raw
 * @returns {{ allowed: true, target: string, info: object }
 *          | { allowed: false, reason: string, target: string }}
 */
function assertSeedable(raw) {
  let info;
  try {
    info = classifyUrl(raw);
  } catch (err) {
    return { allowed: false, reason: err.message, target: safeTarget(raw) };
  }

  const target = safeTarget(raw);

  if (!SEEDABLE_DB_NAMES.includes(info.database)) {
    return {
      allowed: false,
      target,
      reason:
        `refusing to seed database "${info.database}": only ` +
        `${SEEDABLE_DB_NAMES.join(', ')} may be seeded`,
    };
  }

  if (!info.isLocal) {
    return {
      allowed: false,
      target,
      reason: `refusing to seed a non-local database host "${info.host}"`,
    };
  }

  return { allowed: true, target, info };
}

/**
 * Is `login` inside the reserved synthetic namespace (`…@example.invalid`)?
 * Comparison is case-insensitive on the domain part only (logins are lower-cased
 * by the identity domain anyway) and requires a non-empty local part.
 *
 * @param {unknown} login
 * @returns {boolean}
 */
function isSyntheticLogin(login) {
  if (typeof login !== 'string') return false;
  const at = login.lastIndexOf('@');
  if (at <= 0 || at === login.length - 1) return false;
  return login.slice(at + 1).toLowerCase() === SYNTHETIC_LOGIN_DOMAIN;
}

/**
 * Build a deterministic synthetic login inside the reserved namespace, e.g.
 * `clp-00-11.admin@example.invalid`. Throws on an empty/invalid local part so a
 * malformed fixture fails fast rather than silently writing a bad identity.
 *
 * @param {string} local
 * @returns {string}
 */
function syntheticLogin(local) {
  if (typeof local !== 'string' || local.trim().length === 0 || local.includes('@')) {
    throw new Error(`invalid synthetic login local part: ${JSON.stringify(local)}`);
  }
  return `${local.trim()}@${SYNTHETIC_LOGIN_DOMAIN}`;
}

/**
 * Decide whether the ADMIN bootstrap may run.
 *
 * Refuses when:
 *   - the target is not a recognised LOCAL host (bootstrap may target the real
 *     production database, but never a remote/unrecognised host silently);
 *   - `login` (from `CLP_BOOTSTRAP_ADMIN_LOGIN`) is missing/blank;
 *   - `password` (from the git-ignored env) is missing or below the minimum
 *     length the hashing boundary enforces.
 *
 * Note: this guard does NOT consult the database — the "an ADMIN already exists"
 * refusal is a runtime check performed by the command itself (it must read the
 * live state), and is unit-tested via the command's exported decision helper.
 *
 * @param {{ url: string|undefined, login: unknown, password: unknown,
 *           minPasswordLength?: number }} input
 * @returns {{ allowed: true, target: string, login: string, info: object }
 *          | { allowed: false, reason: string, target: string }}
 */
function assertBootstrappable(input) {
  const { url, login, password } = input;
  const minPasswordLength = input.minPasswordLength ?? 8;

  let info;
  try {
    info = classifyUrl(url);
  } catch (err) {
    return { allowed: false, reason: err.message, target: safeTarget(url) };
  }

  const target = safeTarget(url);

  if (!info.isLocal) {
    return {
      allowed: false,
      target,
      reason: `refusing to bootstrap against a non-local database host "${info.host}"`,
    };
  }

  const loginValue = typeof login === 'string' ? login.trim() : '';
  if (loginValue.length === 0) {
    return {
      allowed: false,
      target,
      reason: `refusing to bootstrap: ${BOOTSTRAP_LOGIN_ENV} is not set`,
    };
  }

  if (typeof password !== 'string' || password.length < minPasswordLength) {
    return {
      allowed: false,
      target,
      reason:
        `refusing to bootstrap: ${BOOTSTRAP_PASSWORD_ENV} is missing or shorter than ` +
        `${minPasswordLength} characters`,
    };
  }

  return { allowed: true, target, login: loginValue, info };
}

/**
 * Decide whether the bootstrap may proceed GIVEN the current ADMIN membership
 * count. Pure helper so the "an ADMIN already exists" refusal is unit-testable
 * without a database.
 *
 * @param {{ existingAdminCount: number }} input
 * @returns {{ allowed: true } | { allowed: false, reason: string }}
 */
function assertNoExistingAdmin(input) {
  const count = Number(input && input.existingAdminCount);
  if (!Number.isFinite(count) || count < 0) {
    return { allowed: false, reason: 'refusing to bootstrap: admin count is unknown' };
  }
  if (count > 0) {
    return {
      allowed: false,
      reason:
        'refusing to bootstrap: an ADMIN role membership already exists ' +
        '(bootstrap never replaces an existing admin)',
    };
  }
  return { allowed: true };
}

module.exports = {
  SEEDABLE_DB_NAMES,
  SYNTHETIC_LOGIN_DOMAIN,
  BOOTSTRAP_LOGIN_ENV,
  BOOTSTRAP_PASSWORD_ENV,
  BOOTSTRAP_PASSWORD_ENV_FILE,
  DbUrlError,
  assertSeedable,
  isSyntheticLogin,
  syntheticLogin,
  assertBootstrappable,
  assertNoExistingAdmin,
};
