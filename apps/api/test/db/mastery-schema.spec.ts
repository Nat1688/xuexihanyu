/**
 * CP-04 mastery-projection schema + migration structural tests.
 *
 * File-only (no database, no Prisma engine, no network). Asserts the CP-04
 * schema/migration facts the derived-projection contract requires:
 *
 *   - a `MasteryProjection` model maps to `mastery_projections` and carries the
 *     approved derived columns (actor/item keys, state, due-at, rule version,
 *     rule inputs, source-event cursor, recompute time);
 *   - the `MasteryState` enum declares EXACTLY NEW/LEARNING/FAMILIAR/MASTERED;
 *   - the pair key is UNIQUE (one projection per user+item; recompute overwrites);
 *   - the migration creates EXACTLY the `mastery_projections` table + the enum,
 *     with NO trigger and NO mutation of `learning_events` (it is DERIVED, not
 *     evidence).
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'prisma', 'migrations');
const CP04_MIGRATION = path.join(
  MIGRATIONS_DIR,
  '20261016140000_mastery_projections',
  'migration.sql',
);

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

describe('CP-04 mastery schema', () => {
  it('declares a MasteryProjection model mapped to mastery_projections', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model\s+MasteryProjection\s*\{/);
    expect(modelBody(schema, 'MasteryProjection')).toContain('@@map("mastery_projections")');
  });

  it('carries the approved derived columns', () => {
    const body = modelBody(readSchema(), 'MasteryProjection');
    for (const col of [
      'actorId',
      'learningItemId',
      'state',
      'dueAt',
      'ruleVersion',
      'consecutiveCorrect',
      'latestOutcomeLapsed',
      'sourceLastEventAt',
      'sourceLastEventId',
      'recomputedAt',
    ]) {
      expect(body).toContain(col);
    }
    expect(body).toMatch(/dueAt[\s\S]*@db\.Timestamptz\(6\)/);
    expect(body).toMatch(/recomputedAt[\s\S]*@db\.Timestamptz\(6\)/);
  });

  it('declares EXACTLY the four approved mastery states', () => {
    expect(enumValues(readSchema(), 'MasteryState')).toEqual([
      'NEW',
      'LEARNING',
      'FAMILIAR',
      'MASTERED',
    ]);
  });

  it('declares a UNIQUE (actor, learning item) pair (one projection per pair)', () => {
    expect(modelBody(readSchema(), 'MasteryProjection')).toContain(
      '@@unique([actorId, learningItemId])',
    );
  });

  it('has NO free-form score/random/manual columns', () => {
    const body = modelBody(readSchema(), 'MasteryProjection');
    for (const forbidden of ['score', 'random', 'jitter', 'override', 'manual', 'aiDecision']) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('ships the CP-04 migration', () => {
    expect(fs.existsSync(CP04_MIGRATION)).toBe(true);
  });

  it('the CP-04 migration creates mastery_projections + the enum and nothing else', () => {
    const sql = fs.readFileSync(CP04_MIGRATION, 'utf8');
    const created = [
      ...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w]+)"?/gi),
    ].map((m) => m[1]);
    expect(created).toEqual(['mastery_projections']);
    expect(sql).toContain(
      `CREATE TYPE "MasteryState" AS ENUM ('NEW', 'LEARNING', 'FAMILIAR', 'MASTERED')`,
    );
  });

  it('the CP-04 migration defines the pair unique index and FKs', () => {
    const sql = fs.readFileSync(CP04_MIGRATION, 'utf8');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "mastery_projections_actor_id_learning_item_id_key"',
    );
    expect(sql).toContain('REFERENCES "users"("id")');
    expect(sql).toContain('REFERENCES "learning_items"("id")');
  });

  it('the CP-04 migration NEVER mutates learning_events (derived, not evidence)', () => {
    const sql = [
      fs
        .readFileSync(CP04_MIGRATION, 'utf8')
        .split('\n')
        .map((line) => line.replace(/--.*$/, ''))
        .join('\n'),
    ]
      .join('\n')
      .toLowerCase();
    expect(sql).not.toMatch(/create\s+trigger/i);
    expect(sql).not.toMatch(/alter\s+table\s+"learning_events"/i);
    expect(sql).not.toMatch(/update\s+"learning_events"/i);
    expect(sql).not.toMatch(/delete\s+from\s+"learning_events"/i);
    expect(sql).not.toMatch(/insert\s+into\s+"learning_events"/i);
  });
});
