/**
 * CLP-00-04 — Database URL classification & test-reset guard (pure unit tests).
 *
 * These tests exercise the guard LOGIC only: no database, no network, no Nest.
 * They assert the safety contract that protects `clp_dev` and any non-test
 * target from destructive actions, and that a valid local `clp_test` target is
 * the sole resettable case (with explicit confirmation).
 *
 * The module under test lives outside the API workspace (repo `scripts/db/`),
 * so it is required via a relative CommonJS import — it is dependency-free and
 * performs no I/O.
 */
import {
  classifyUrl,
  safeTarget,
  assertResettable,
  DbUrlError,
  DEV_DB_NAME,
  TEST_DB_NAME,
} from '../../../../scripts/db/db-url.cjs';

const DEV_URL = 'postgresql://clp_app:secret@localhost:5432/clp_dev?schema=public';
const TEST_URL = 'postgresql://clp_app:secret@127.0.0.1:5433/clp_test?schema=public';
const OTHER_URL = 'postgresql://clp_app:secret@localhost:5432/clp_prod?schema=public';
const REMOTE_TEST_URL = 'postgresql://clp_app:secret@db.example.com:5432/clp_test?schema=public';

describe('classifyUrl', () => {
  it('classifies the development database', () => {
    const info = classifyUrl(DEV_URL);
    expect(info.kind).toBe('development');
    expect(info.database).toBe(DEV_DB_NAME);
    expect(info.isLocal).toBe(true);
  });

  it('classifies the test database', () => {
    const info = classifyUrl(TEST_URL);
    expect(info.kind).toBe('test');
    expect(info.database).toBe(TEST_DB_NAME);
    expect(info.isLocal).toBe(true);
  });

  it('classifies any other database as "other"', () => {
    expect(classifyUrl(OTHER_URL).kind).toBe('other');
  });

  it('accepts the postgres: scheme alias', () => {
    expect(classifyUrl('postgres://u:p@localhost:5432/clp_dev').database).toBe(DEV_DB_NAME);
  });

  it('rejects a missing or empty URL', () => {
    expect(() => classifyUrl(undefined)).toThrow(DbUrlError);
    expect(() => classifyUrl('')).toThrow(DbUrlError);
  });

  it('rejects a non-postgres protocol', () => {
    expect(() => classifyUrl('mysql://u:p@localhost:3306/clp_dev')).toThrow(DbUrlError);
  });

  it('rejects a URL with no database name', () => {
    expect(() => classifyUrl('postgresql://localhost:5432/')).toThrow(DbUrlError);
  });
});

describe('safeTarget', () => {
  it('never includes the password', () => {
    const out = safeTarget(TEST_URL);
    expect(out).not.toContain('secret');
    expect(out).toContain(TEST_DB_NAME);
  });

  it('returns a placeholder for an unparseable URL', () => {
    expect(safeTarget('not-a-url')).toContain('unparseable');
  });
});

describe('assertResettable (guard)', () => {
  it('refuses to reset the development database even with confirmation', () => {
    const d = assertResettable(DEV_URL, { confirm: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toMatch(/clp_dev|only/);
  });

  it('refuses any non-CLP database name', () => {
    const d = assertResettable(OTHER_URL, { confirm: true });
    expect(d.allowed).toBe(false);
  });

  it('refuses a clp_test database on a non-local host', () => {
    const d = assertResettable(REMOTE_TEST_URL, { confirm: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toMatch(/non-local/);
  });

  it('refuses a local clp_test without explicit confirmation', () => {
    const d = assertResettable(TEST_URL, { confirm: false });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toMatch(/confirmation/);
  });

  it('refuses when confirmation is omitted entirely', () => {
    expect(assertResettable(TEST_URL).allowed).toBe(false);
  });

  it('refuses a malformed URL', () => {
    expect(assertResettable('nonsense', { confirm: true }).allowed).toBe(false);
  });

  it('allows a local clp_test with explicit confirmation', () => {
    const d = assertResettable(TEST_URL, { confirm: true });
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.target).toContain(TEST_DB_NAME);
  });

  it('allows localhost clp_test with confirmation', () => {
    const d = assertResettable('postgresql://u:p@localhost:5432/clp_test?schema=public', {
      confirm: true,
    });
    expect(d.allowed).toBe(true);
  });
});
