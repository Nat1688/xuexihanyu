#!/usr/bin/env node
/**
 * CLP-00-04 — Database URL classification & test-reset guard (shared library).
 *
 * This module is the single source of truth for deciding WHAT a database URL
 * points at and WHETHER a destructive action (reset/drop/recreate) is allowed.
 * It performs no I/O and opens no connection: it only parses and classifies.
 *
 * Safety model (CLP-00-04 acceptance criteria 1 & 4):
 *   - `clp_dev`  → development database. Never destructively reset.
 *   - `clp_test` → the ONLY database that may be reset, and only on a
 *                  recognised local host with an explicit confirmation flag.
 *   - anything else (other DBs, other hosts, malformed URLs) → refused.
 *
 * The module never reads/echoes a password: `safeTarget()` redacts credentials
 * so a URL can be printed or logged without leaking a secret value.
 */
'use strict';

/** Canonical database names for the CLP foundation. */
const DEV_DB_NAME = 'clp_dev';
const TEST_DB_NAME = 'clp_test';

/** Hosts recognised as "local" for the destructive test-reset path. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

/** The exact database names a reset is permitted to target. */
const RESETTABLE_DB_NAMES = new Set([TEST_DB_NAME]);

class DbUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DbUrlError';
  }
}

/**
 * Parse and classify a PostgreSQL connection URL.
 *
 * @param {string|undefined} raw
 * @returns {{ raw: string, protocol: string, username: string|null, password: string|null,
 *             host: string, port: string, database: string, kind: 'development'|'test'|'other',
 *             isLocal: boolean }}
 * @throws {DbUrlError} on missing or malformed URL.
 */
function classifyUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new DbUrlError('database URL is missing or empty');
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new DbUrlError('database URL is not a valid URL');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new DbUrlError(`unsupported database URL protocol: ${url.protocol}`);
  }

  // `new URL('postgresql://h/db')` puts the DB name in `pathname` (leading '/').
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new DbUrlError('database URL does not name a database');
  }

  const host = url.hostname;
  if (!host) {
    throw new DbUrlError('database URL does not name a host');
  }

  let kind = 'other';
  if (database === DEV_DB_NAME) kind = 'development';
  else if (database === TEST_DB_NAME) kind = 'test';

  return {
    raw,
    protocol: url.protocol,
    username: url.username ? decodeURIComponent(url.username) : null,
    password: url.password ? decodeURIComponent(url.password) : null,
    host,
    port: url.port || '5432',
    database,
    kind,
    isLocal: LOCAL_HOSTS.has(host),
  };
}

/**
 * Redact credentials from a URL for safe logging/printing.
 * Never returns the password (or userinfo) portion.
 *
 * @param {string} raw
 * @returns {string}
 */
function safeTarget(raw) {
  try {
    const info = classifyUrl(raw);
    return `postgresql://${info.username ? '***@' : ''}${info.host}:${info.port}/${info.database}`;
  } catch {
    return '[unparseable database URL]';
  }
}

/**
 * Decide whether a destructive reset of the URL's database is permitted.
 *
 * A reset is allowed ONLY when ALL of:
 *   1. the URL parses;
 *   2. its database name is exactly a resettable name (`clp_test`);
 *   3. its host is a recognised local host;
 *   4. the caller passed an explicit confirmation (`confirm === true`).
 *
 * @param {string} raw
 * @param {{ confirm?: boolean }} [options]
 * @returns {{ allowed: true, target: string, info: object } | { allowed: false, reason: string, target: string }}
 */
function assertResettable(raw, options = {}) {
  const confirm = options.confirm === true;

  let info;
  try {
    info = classifyUrl(raw);
  } catch (err) {
    return { allowed: false, reason: err.message, target: safeTarget(raw) };
  }

  const target = safeTarget(raw);

  if (!RESETTABLE_DB_NAMES.has(info.database)) {
    // This covers clp_dev explicitly and any other non-CLP / unexpected name.
    return {
      allowed: false,
      target,
      reason:
        `refusing to reset database "${info.database}": only ` +
        `${[...RESETTABLE_DB_NAMES].join(', ')} may be reset`,
    };
  }

  if (!info.isLocal) {
    return {
      allowed: false,
      target,
      reason: `refusing to reset a non-local database host "${info.host}"`,
    };
  }

  if (!confirm) {
    return {
      allowed: false,
      target,
      reason:
        'refusing to reset without explicit confirmation ' +
        '(pass --yes / CLP_RESET_CONFIRM=1 for the isolated test database)',
    };
  }

  return { allowed: true, target, info };
}

module.exports = {
  DEV_DB_NAME,
  TEST_DB_NAME,
  LOCAL_HOSTS,
  RESETTABLE_DB_NAMES,
  DbUrlError,
  classifyUrl,
  safeTarget,
  assertResettable,
};
