#!/usr/bin/env node
/**
 * CLP-00-04 — Strict test-database reset guard (`clp_test` only).
 *
 * Usage:
 *   node scripts/db/db-reset-guard.cjs [--env test|dev] [--dry-run] [--yes]
 *
 * Behaviour:
 *   - Default is DRY-RUN: it classifies the target URL and reports whether a
 *     reset would be permitted. It performs NO destructive action.
 *   - A real reset requires `--yes` (or CLP_RESET_CONFIRM=1) AND a target that
 *     passes every guard: database name is exactly `clp_test`, host is local,
 *     URL parses. `clp_dev` and any other database are always refused.
 *   - The destructive step drops & recreates ONLY the target database via
 *     `prisma migrate reset --force --skip-seed` bound to TEST_DATABASE_URL,
 *     which re-applies migrations from zero. It never secedes to `db push`.
 *
 * Exit codes: 0 = success/dry-run-ok, 1 = refused or error.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { classifyUrl, safeTarget, assertResettable } = require('./db-url.cjs');
const { getUrl, REPO_ROOT } = require('./env.cjs');

function parseArgs(argv) {
  const args = { env: 'test', dryRun: true, yes: false };
  for (const a of argv) {
    if (a === '--env' || a.startsWith('--env=')) {
      args.env = a.includes('=') ? a.split('=')[1] : undefined;
    } else if (a === 'test' || a === 'dev') {
      if (!args.envExplicit) args.env = a;
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--yes' || a === '-y') {
      args.yes = true;
      args.dryRun = false;
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    }
  }
  // `--env test` (space form): consume the following bare token.
  const idx = argv.indexOf('--env');
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
    args.env = argv[idx + 1];
  }
  if (idx !== -1) args.envExplicit = true;
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(
      'Usage: node scripts/db/db-reset-guard.cjs [--env test|dev] [--dry-run] [--yes]\n',
    );
    return 0;
  }

  const envKey = args.env === 'dev' ? 'dev' : 'test';
  const raw = getUrl(envKey);

  if (!raw) {
    process.stderr.write(
      `[db-reset-guard] no ${envKey === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL'} ` +
        `configured (set it in the git-ignored .env). Aborting.\n`,
    );
    return 1;
  }

  // Classify for reporting (never echoes credentials).
  let info;
  try {
    info = classifyUrl(raw);
  } catch (err) {
    process.stderr.write(`[db-reset-guard] ${err.message} (target: ${safeTarget(raw)})\n`);
    return 1;
  }

  const confirm =
    args.yes || process.env.CLP_RESET_CONFIRM === '1' || process.env.CLP_RESET_CONFIRM === 'true';
  const decision = assertResettable(raw, { confirm: args.dryRun ? false : confirm });

  process.stdout.write(
    `[db-reset-guard] env=${envKey} target=${decision.target} ` +
      `kind=${info.kind} local=${info.isLocal} dryRun=${args.dryRun}\n`,
  );

  if (!decision.allowed) {
    // In dry-run we expect refusal *unless* nothing but --yes is missing; we
    // still print PASS/refusal clearly for both dry-run and real runs.
    const onlyConfirmationMissing =
      info.database === 'clp_test' && info.isLocal && !confirm && !args.dryRun;
    process.stderr.write(`[db-reset-guard] REFUSED: ${decision.reason}\n`);
    // Dry-run on a valid clp_test target is a SUCCESS demonstration of the guard.
    if (args.dryRun && info.database === 'clp_test' && info.isLocal) {
      process.stdout.write('[db-reset-guard] dry-run OK: reset WOULD be permitted with --yes.\n');
      return 0;
    }
    void onlyConfirmationMissing;
    return 1;
  }

  // Allowed real reset: run prisma migrate reset against the test URL only.
  process.stdout.write('[db-reset-guard] confirmed: resetting the isolated test database…\n');
  const prismaBin = path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
  const res = spawnSync(
    prismaBin,
    ['migrate', 'reset', '--force', '--skip-seed', '--schema', 'prisma/schema.prisma'],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    shell: process.platform === 'win32',
      env: { ...process.env, DATABASE_URL: raw },
    },
  );
  if (res.error) {
    process.stderr.write(`[db-reset-guard] failed to run prisma: ${res.error.message}\n`);
    return 1;
  }
  return res.status === null ? 1 : res.status;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { parseArgs };
