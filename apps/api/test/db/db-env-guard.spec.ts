/**
 * CLP-00-04 — `.env` loader + reset-guard CLI arg parsing (pure unit tests).
 *
 * No database, no network. Verifies the git-ignored-env resolution precedence
 * and the reset-guard's `--dry-run`/`--yes` default safety (dry-run by default,
 * never destructive unless explicitly confirmed).
 */
import { parseEnvFile, resolveKey } from '../../../../scripts/db/env.cjs';
import { parseArgs } from '../../../../scripts/db/db-reset-guard.cjs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('parseEnvFile', () => {
  it('parses key=value, ignores comments/blank lines, strips quotes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clp-env-'));
    const file = path.join(dir, '.env');
    fs.writeFileSync(
      file,
      [
        '# a comment',
        '',
        'DATABASE_URL=postgresql://u:p@localhost:5432/clp_dev',
        'TEST_DATABASE_URL="postgresql://u:p@localhost:5433/clp_test"',
        "QUOTED='raw value'",
        'EMPTY=',
      ].join('\n'),
    );
    const env = parseEnvFile(file);
    expect(env.DATABASE_URL).toContain('clp_dev');
    expect(env.TEST_DATABASE_URL).toContain('clp_test');
    expect(env.QUOTED).toBe('raw value');
    expect(env.EMPTY).toBe('');
    expect(Object.keys(env)).not.toContain('# a comment');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty object for a missing file', () => {
    expect(parseEnvFile(path.join(os.tmpdir(), 'definitely-missing-clp.env'))).toEqual({});
  });
});

describe('resolveKey precedence', () => {
  it('prefers an explicit shell value over the file value', () => {
    const fileEnv = { DATABASE_URL: 'from-file' };
    const prev = process.env.CLP_TEST_PRECEDENCE_KEY;
    process.env.CLP_TEST_PRECEDENCE_KEY = 'from-shell';
    try {
      expect(resolveKey('CLP_TEST_PRECEDENCE_KEY', fileEnv)).toBe('from-shell');
    } finally {
      if (prev === undefined) delete process.env.CLP_TEST_PRECEDENCE_KEY;
      else process.env.CLP_TEST_PRECEDENCE_KEY = prev;
    }
  });

  it('falls back to the file value when the shell value is absent', () => {
    const fileEnv = { SOME_KEY: 'from-file' };
    expect(resolveKey('CLP_DEFINITELY_UNSET_KEY', fileEnv)).toBeUndefined();
    expect(resolveKey('SOME_KEY', fileEnv)).toBe('from-file');
  });
});

describe('db-reset-guard argument parsing', () => {
  it('defaults to test env, dry-run, no confirmation', () => {
    const a = parseArgs([]);
    expect(a.env).toBe('test');
    expect(a.dryRun).toBe(true);
    expect(a.yes).toBe(false);
  });

  it('--yes enables the destructive path (dry-run off)', () => {
    const a = parseArgs(['--yes']);
    expect(a.yes).toBe(true);
    expect(a.dryRun).toBe(false);
  });

  it('parses `--env dev` (space form) for the guard', () => {
    const a = parseArgs(['--env', 'dev']);
    expect(a.env).toBe('dev');
  });

  it('parses `--env=dev` (equals form)', () => {
    const a = parseArgs(['--env=dev']);
    expect(a.env).toBe('dev');
  });

  it('treats --dry-run as non-destructive', () => {
    const a = parseArgs(['--dry-run']);
    expect(a.dryRun).toBe(true);
    expect(a.yes).toBe(false);
  });
});
