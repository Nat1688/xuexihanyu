/**
 * CLP-00-04 — Prisma foundation schema invariant (pure unit test).
 *
 * Asserts the CP-00 migration foundation stays model-free: `schema.prisma`
 * declares the PostgreSQL datasource + client generator and NO models, and the
 * baseline migration issues no `CREATE TABLE`. This is the guard that keeps the
 * foundation task from silently evolving into domain-schema work (CLP-00-04
 * "Explicitly forbidden"; ADR-002 "CP-00 schema scope").
 *
 * File-only: no database, no Prisma engine, no network.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'prisma', 'migrations');

describe('prisma foundation schema', () => {
  it('exists', () => {
    expect(fs.existsSync(SCHEMA_PATH)).toBe(true);
  });

  it('declares a postgresql datasource and prisma-client-js generator', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    expect(schema).toMatch(/provider\s*=\s*"postgresql"/);
    expect(schema).toMatch(/provider\s*=\s*"prisma-client-js"/);
    expect(schema).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
  });

  it('declares NO models (CP-00 foundation only)', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const models = schema.match(/^\s*model\s+\w+\s*\{/gm) || [];
    expect(models).toEqual([]);
  });

  it('ships at least one baseline migration', () => {
    expect(fs.existsSync(MIGRATIONS_DIR)).toBe(true);
    const entries = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory());
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('every migration SQL adds no tables (no CREATE TABLE)', () => {
    const dirs = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const dir of dirs) {
      const sqlPath = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf8');
      expect(sql.match(/CREATE\s+TABLE/gi) || []).toEqual([]);
    }
  });
});
