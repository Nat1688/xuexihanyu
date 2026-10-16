/**
 * Prisma schema invariants (CLP-00-05 identity + CLP-00-06 session + CP-01 content).
 *
 * CLP-00-04 shipped a model-free foundation; CLP-00-05 authorized EXACTLY three
 * identity models/tables (ADR-004); CLP-00-06 added exactly one session table;
 * and CP-01 adds exactly the approved content-domain models/tables:
 *
 *   identity   : `User` -> `users`, `PasswordCredential` -> `password_credentials`,
 *                `UserRoleAssignment` -> `user_roles`
 *   session    : `Session` -> `sessions`
 *   content    : `Course` -> `courses`, `Unit` -> `units`, `Lesson` -> `lessons`,
 *                `LearningItem` -> `learning_items`,
 *                `LessonLearningItem` -> `lesson_learning_items`
 *
 * This guard asserts the schema declares the datasource + client generator and
 * EXACTLY those approved models and no others, and that every migration creates
 * only approved tables (no CP-02 exercise/answer/evaluation, CP-03 learning
 * event, CP-04 mastery/review, media/import-export/AI/analytics table may
 * appear). It is the structural gate that keeps each checkpoint from silently
 * growing into later-checkpoint or forbidden schema.
 *
 * File-only: no database, no Prisma engine, no network.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'prisma', 'migrations');

/** The approved Prisma model names (CLP-00-05/06 + CP-01). */
const APPROVED_MODELS = [
  'User',
  'PasswordCredential',
  'UserRoleAssignment',
  'Session',
  'Course',
  'Unit',
  'Lesson',
  'LearningItem',
  'LessonLearningItem',
];

/** The approved physical table names (CLP-00-05/06 + CP-01). */
const APPROVED_TABLES = [
  'users',
  'password_credentials',
  'user_roles',
  'sessions',
  'courses',
  'units',
  'lessons',
  'learning_items',
  'lesson_learning_items',
];

/** The approved enums (CLP-00-05/06 + CP-01). */
const APPROVED_ENUMS = ['AccountState', 'UserRole', 'ContentVisibility', 'LearningItemKind'];

/** The only tables a migration may create, plus Prisma metadata. */
const ALLOWED_CREATED_TABLES = new Set([...APPROVED_TABLES, '_prisma_migrations']);

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

function modelNames(schema: string): string[] {
  return (schema.match(/^\s*model\s+(\w+)\s*\{/gm) || []).map((m) =>
    m.replace(/^\s*model\s+/, '').replace(/\s*\{$/, ''),
  );
}

function migrationDirs(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

function createdTables(sql: string): string[] {
  const names: string[] = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w]+)"?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    names.push(match[1]);
  }
  return names;
}

describe('prisma identity schema', () => {
  it('exists', () => {
    expect(fs.existsSync(SCHEMA_PATH)).toBe(true);
  });

  it('declares a postgresql datasource and prisma-client-js generator', () => {
    const schema = readSchema();
    expect(schema).toMatch(/provider\s*=\s*"postgresql"/);
    expect(schema).toMatch(/provider\s*=\s*"prisma-client-js"/);
    expect(schema).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
  });

  it('declares EXACTLY the approved models and no others (CLP-00-05/06 + CP-01)', () => {
    const models = modelNames(readSchema());
    expect([...models].sort()).toEqual([...APPROVED_MODELS].sort());
  });

  it('declares the approved enums only', () => {
    const enums = (readSchema().match(/^\s*enum\s+(\w+)\s*\{/gm) || []).map((m) =>
      m.replace(/^\s*enum\s+/, '').replace(/\s*\{$/, ''),
    );
    expect([...enums].sort()).toEqual([...APPROVED_ENUMS].sort());
  });

  it('maps each model to an approved table name', () => {
    const schema = readSchema();
    for (const table of APPROVED_TABLES) {
      expect(schema).toContain(`@@map("${table}")`);
    }
  });

  it('ships at least one baseline migration', () => {
    expect(fs.existsSync(MIGRATIONS_DIR)).toBe(true);
    expect(migrationDirs().length).toBeGreaterThanOrEqual(1);
  });

  it('every migration creates ONLY approved tables (no forbidden DDL)', () => {
    for (const dir of migrationDirs()) {
      const sqlPath = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf8');
      for (const table of createdTables(sql)) {
        expect(ALLOWED_CREATED_TABLES.has(table)).toBe(true);
      }
    }
  });

  it('does not define a profile/class/enrollment/CP-02+ table', () => {
    for (const dir of migrationDirs()) {
      const sqlPath = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf8').toLowerCase();
      const created = createdTables(sql).map((t) => t.toLowerCase());
      // Identity-adjacent, CP-02 exercise/answer/evaluation, CP-03 learning
      // event, CP-04 mastery/review, and other forbidden subjects.
      for (const forbidden of [
        'classes',
        'profiles',
        'enrollments',
        'assignments',
        'exercises',
        'answers',
        'evaluations',
        'learning_events',
        'mastery',
        'reviews',
        'media',
        'analytics',
      ]) {
        expect(created).not.toContain(forbidden);
      }
    }
  });
});
