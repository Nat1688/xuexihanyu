#!/usr/bin/env node
/**
 * CLP-00-04 — Migration runner wrapper.
 *
 * Usage:
 *   node scripts/db/db-migrate.cjs deploy   # apply pending migrations (dev by default)
 *   node scripts/db/db-migrate.cjs deploy --env test
 *   node scripts/db/db-migrate.cjs dev      # create+apply a dev migration (clp_dev only)
 *   node scripts/db/db-migrate.cjs validate # zero->current on clp_test
 *
 * `deploy` binds DATABASE_URL, or TEST_DATABASE_URL with `--env test`.
 * `dev` refuses any non-`clp_dev`/non-local target (it can rewrite history).
 * This wrapper never uses `prisma db push` (forbidden by CLP-00-04 / ADR-002).
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { classifyUrl, safeTarget } = require('./db-url.cjs');
const { getUrl, REPO_ROOT } = require('./env.cjs');

function runPrisma(args, url) {
  const prismaBin = path.join(
    REPO_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
  return spawnSync(prismaBin, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: url },
  });
}

function pickUrl(which) {
  const raw = getUrl(which);
  if (!raw) {
    process.stderr.write(
      `[db-migrate] ${which === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL'} is not set ` +
        `(set it in the git-ignored .env). Aborting.\n`,
    );
    process.exit(1);
  }
  return raw;
}

function main() {
  const sub = process.argv[2];
  const envArgIdx = process.argv.indexOf('--env');
  const which = envArgIdx !== -1 ? process.argv[envArgIdx + 1] : undefined;
  const schema = ['--schema', 'prisma/schema.prisma'];

  if (sub === 'deploy' || sub === 'validate') {
    const target = sub === 'validate' || which === 'test' ? 'test' : 'dev';
    const url = pickUrl(target);
    classifyUrl(url); // fail fast on a malformed URL
    process.stdout.write(`[db-migrate] ${sub} -> ${safeTarget(url)}\n`);
    const res = runPrisma(['migrate', 'deploy', ...schema], url);
    process.exit(res.status === null ? 1 : res.status);
  }

  if (sub === 'dev') {
    const url = pickUrl('dev');
    const info = classifyUrl(url);
    if (info.database !== 'clp_dev' || !info.isLocal) {
      process.stderr.write(
        `[db-migrate] refusing \`migrate dev\` against non-development target ` +
          `${safeTarget(url)}; use \`migrate deploy\` for non-dev databases.\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`[db-migrate] dev migration -> ${safeTarget(url)}\n`);
    const res = runPrisma(['migrate', 'dev', ...schema], url);
    process.exit(res.status === null ? 1 : res.status);
  }

  process.stderr.write('Usage: db-migrate.cjs <deploy|dev|validate> [--env test]\n');
  process.exit(2);
}

if (require.main === module) {
  main();
}
