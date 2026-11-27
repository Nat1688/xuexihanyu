import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SCHEMA = path.join(REPO_ROOT, 'prisma', 'schema.prisma');
const MIGRATION = path.join(
  REPO_ROOT,
  'prisma',
  'migrations',
  '20261020150000_cp05_submission_integrity',
  'migration.sql',
);
const PREFLIGHT = path.join(REPO_ROOT, 'scripts', 'db', 'cp05-submission-uniqueness-preflight.sql');

describe('CP-05 submission integrity schema', () => {
  it('enforces one submission per session while retaining the token idempotency key', () => {
    const schema = fs.readFileSync(SCHEMA, 'utf8');
    const body = schema.match(/model\s+AnswerSubmission\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(body).toMatch(/exerciseSessionId\s+String\s+@unique/);
    expect(body).toContain('@@unique([exerciseSessionId, submissionToken])');
  });

  it('ships a non-destructive migration that aborts when historical duplicates exist', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');

    expect(sql).toMatch(/GROUP\s+BY\s+"exercise_session_id"/i);
    expect(sql).toMatch(/HAVING\s+COUNT\(\*\)\s*>\s*1/i);
    expect(sql).toContain('answer_submissions_exercise_session_id_key');
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+"answer_submissions"/i);
  });

  it('provides a read-only preflight query for operators', () => {
    const sql = fs.readFileSync(PREFLIGHT, 'utf8');

    expect(sql).toMatch(/SELECT[\s\S]+GROUP\s+BY[\s\S]+HAVING\s+COUNT\(\*\)\s*>\s*1/i);
    expect(sql).not.toMatch(/\b(?:DELETE|UPDATE|INSERT|ALTER|DROP)\b/i);
  });
});
