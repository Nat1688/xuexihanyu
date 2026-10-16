/**
 * CP-03 learning-events schema + migration structural tests.
 *
 * File-only (no database, no Prisma engine, no network). Asserts the CP-03
 * schema/migration facts the append-only evidence contract requires:
 *
 *   - the `LearningEvent` model maps to `learning_events` and carries the
 *     approved columns (public id, schema version, type, actor, optional
 *     content/exercise references, UTC occurred-at, bounded metadata, receipt
 *     time);
 *   - the `LearningEventType` enum declares EXACTLY the six approved values;
 *   - the CP-03 migration creates EXACTLY the `learning_events` table plus the
 *     approved enum, with NO update/delete trigger or mutable column, and NO
 *     derived progress/mastery column.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'prisma', 'migrations');
const CP03_MIGRATION = path.join(MIGRATIONS_DIR, '20261016100400_learning_events', 'migration.sql');

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

function modelBody(schema: string, name: string): string {
  const re = new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = schema.match(re);
  if (!match) throw new Error(`model ${name} not found`);
  return match[1];
}

function enumValues(schema: string, name: string): string[] {
  const re = new RegExp(`enum\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = schema.match(re);
  if (!match) throw new Error(`enum ${name} not found`);
  return match[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('//'));
}

describe('CP-03 learning-events schema', () => {
  it('declares a LearningEvent model mapped to learning_events', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model\s+LearningEvent\s*\{/);
    expect(modelBody(schema, 'LearningEvent')).toContain('@@map("learning_events")');
  });

  it('carries the approved columns', () => {
    const body = modelBody(readSchema(), 'LearningEvent');
    for (const col of [
      'publicId',
      'schemaVersion',
      'type',
      'actorId',
      'courseId',
      'unitId',
      'lessonId',
      'learningItemId',
      'exerciseRef',
      'occurredAt',
      'metadata',
      'createdAt',
    ]) {
      expect(body).toContain(col);
    }
    // UTC instants.
    expect(body).toMatch(/occurredAt[\s\S]*@db\.Timestamptz\(6\)/);
    expect(body).toMatch(/createdAt[\s\S]*@db\.Timestamptz\(6\)/);
  });

  it('uses a non-guessable UNIQUE public UUID distinct from the surrogate id', () => {
    const body = modelBody(readSchema(), 'LearningEvent');
    expect(body).toMatch(/publicId\s+String\s+@unique\s+@default\(uuid\(\)\)/);
    expect(body).toMatch(/id\s+String\s+@id\s+@default\(uuid\(\)\)/);
  });

  it('declares EXACTLY the six approved event types', () => {
    expect(enumValues(readSchema(), 'LearningEventType')).toEqual([
      'LESSON_STARTED',
      'LESSON_COMPLETED',
      'EXERCISE_PRESENTED',
      'ANSWER_SUBMITTED',
      'EXERCISE_COMPLETED',
      'REVIEW_ACTIVITY',
    ]);
  });

  it('declares the ordering index (occurredAt, id)', () => {
    expect(modelBody(readSchema(), 'LearningEvent')).toContain('@@index([occurredAt, id])');
  });

  it('ships the CP-03 migration', () => {
    expect(fs.existsSync(CP03_MIGRATION)).toBe(true);
  });

  it('the CP-03 migration creates learning_events + the enum and nothing else', () => {
    const sql = fs.readFileSync(CP03_MIGRATION, 'utf8');
    const created = [
      ...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w]+)"?/gi),
    ].map((m) => m[1]);
    expect(created).toEqual(['learning_events']);
    expect(sql).toContain(
      `CREATE TYPE "LearningEventType" AS ENUM ('LESSON_STARTED', 'LESSON_COMPLETED', 'EXERCISE_PRESENTED', 'ANSWER_SUBMITTED', 'EXERCISE_COMPLETED', 'REVIEW_ACTIVITY')`,
    );
  });

  it('the CP-03 migration defines NO update/delete trigger (append-only)', () => {
    const sql = fs.readFileSync(CP03_MIGRATION, 'utf8');
    expect(sql).not.toMatch(/CREATE\s+TRIGGER/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/UPDATE\s+"learning_events"/i);
  });

  it('the CP-03 migration has NO derived progress/mastery column', () => {
    // Strip `--` line comments (the migration documents what is forbidden in its
    // header) so we assert on executable DDL only.
    const sql = fs
      .readFileSync(CP03_MIGRATION, 'utf8')
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
      .toLowerCase();
    for (const forbidden of ['mastery', 'progress', 'score', 'streak', 'schedule']) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it('keeps metadata as bounded JSONB and exercise ref bounded', () => {
    const sql = fs.readFileSync(CP03_MIGRATION, 'utf8');
    expect(sql).toContain('"metadata" JSONB');
    expect(sql).toContain('"exercise_ref" VARCHAR(200)');
  });
});
