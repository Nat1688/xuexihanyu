/**
 * Session migration guard (CLP-00-06).
 *
 * The CLP-00-06 migration must ONLY add the `sessions` table (plus its indexes
 * and FK). It must NOT drop, rename or alter the CLP-00-05 identity tables
 * (`users`, `password_credentials`, `user_roles`) or any other pre-existing
 * object — this is the structural analogue of "session migration only adds
 * sessions" in the task contract.
 *
 * File-only: no database, no Prisma engine, no network. Proves the migration is
 * additive by static SQL inspection, which is why it runs in the sandbox where
 * no root DB credentials exist.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'prisma', 'migrations');
const SESSION_MIGRATION_DIR = path.join(MIGRATIONS_DIR, '20261015090000_session_lifecycle');

/** The CLP-00-05 identity tables that must survive untouched. */
const PREEXISTING_TABLES = ['users', 'password_credentials', 'user_roles'];

function readSessionSql(): string {
  return fs.readFileSync(path.join(SESSION_MIGRATION_DIR, 'migration.sql'), 'utf8');
}

function allMigrationSql(): Array<{ dir: string; sql: string }> {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ dir: e.name, sql: path.join(MIGRATIONS_DIR, e.name, 'migration.sql') }))
    .filter((m) => fs.existsSync(m.sql))
    .map((m) => ({ dir: m.dir, sql: fs.readFileSync(m.sql, 'utf8') }));
}

function createdTables(sql: string): string[] {
  const names: string[] = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w]+)"?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) names.push(match[1].toLowerCase());
  return names;
}

describe('session migration is additive (only adds sessions)', () => {
  it('exists as an additive migration directory', () => {
    expect(fs.existsSync(SESSION_MIGRATION_DIR)).toBe(true);
    expect(fs.existsSync(path.join(SESSION_MIGRATION_DIR, 'migration.sql'))).toBe(true);
  });

  it('creates the sessions table', () => {
    expect(createdTables(readSessionSql())).toContain('sessions');
  });

  it('creates NO table other than sessions (no accidental extra object)', () => {
    const created = createdTables(readSessionSql());
    expect([...new Set(created)]).toEqual(['sessions']);
  });

  it('never DROPs or TRUNCATEs any pre-existing table', () => {
    const sql = readSessionSql().toLowerCase();
    expect(sql).not.toMatch(/drop\s+table/);
    expect(sql).not.toMatch(/truncate/);
    // And not any of the identity tables specifically.
    for (const table of PREEXISTING_TABLES) {
      expect(sql).not.toMatch(new RegExp(`drop\\s+table[^;]*\\b${table}\\b`));
    }
  });

  it('never ALTERs a pre-existing identity table', () => {
    const sql = readSessionSql().toLowerCase();
    for (const table of PREEXISTING_TABLES) {
      expect(sql).not.toMatch(new RegExp(`alter\\s+table\\s+"?${table}"?`));
    }
  });

  it('does not rename or drop columns/types', () => {
    const sql = readSessionSql().toLowerCase();
    expect(sql).not.toMatch(/drop\s+column/);
    expect(sql).not.toMatch(/rename\s+column/);
    expect(sql).not.toMatch(/rename\s+to/);
    expect(sql).not.toMatch(/drop\s+type/);
  });

  it('binds the session to the existing users table via an FK (not a new user table)', () => {
    const sql = readSessionSql();
    expect(sql).toMatch(/FOREIGN\s+KEY\s*\(\s*"?user_id"?\s*\)\s*REFERENCES\s*"?users"?/i);
  });

  it('the FK uses ON DELETE CASCADE so sessions cannot outlive their user', () => {
    const sql = readSessionSql();
    expect(sql).toMatch(/ON\s+DELETE\s+CASCADE/i);
  });

  it('across ALL migrations, only the approved tables are ever created', () => {
    // Identity (CLP-00-05), session (CLP-00-06), CP-01 content and CP-03
    // learning-event tables.
    const approved = new Set([
      'users',
      'password_credentials',
      'user_roles',
      'sessions',
      'courses',
      'units',
      'lessons',
      'learning_items',
      'lesson_learning_items',
      'learning_events',
    ]);
    for (const { dir, sql } of allMigrationSql()) {
      for (const table of createdTables(sql)) {
        expect(approved.has(table)).toBe(true);
        expect(dir).toBeTruthy();
      }
    }
  });
});
