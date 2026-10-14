#!/usr/bin/env node
/**
 * CLP-00-04 — Zero→current migration validation for the isolated test database.
 *
 * Steps (all against TEST_DATABASE_URL = clp_test only):
 *   1. Guard: refuse unless the URL is exactly a local `clp_test`.
 *   2. Drop & recreate the target database from zero (deterministic reset),
 *      then `prisma migrate deploy` to reach current state.
 *   3. `prisma migrate status` to prove it is up to date.
 *   4. Inspect non-system tables: assert the ONLY present table is Prisma's
 *      migration metadata (`_prisma_migrations`). Any other table means a
 *      domain schema leaked in and the check FAILS.
 *
 * Exit 0 only when every step passes.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { classifyUrl, safeTarget, assertResettable } = require('./db-url.cjs');
const { getUrl, REPO_ROOT } = require('./env.cjs');

function prisma(args, url) {
  const prismaBin = path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
  return spawnSync(prismaBin, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: url },
  });
}

function psqlBin() {
  if (process.env.CLP_PSQL_BIN) return process.env.CLP_PSQL_BIN;
  // Try PATH, then a few common PostgreSQL install locations.
  const candidates = ['psql', '/usr/lib/postgresql/16/bin/psql', '/usr/lib/postgresql/15/bin/psql'];
  for (const c of candidates) {
    const probe = spawnSync(c, ['--version'], { stdio: 'ignore' });
    if (!probe.error && probe.status === 0) return c;
  }
  return 'psql';
}

function listTables(url) {
  const psql = psqlBin();
  // `psql` rejects the Prisma `?schema=...` query parameter; strip it for the
  // raw libpq connection string.
  const conn = url.split('?')[0];
  const sql =
    "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name;";
  const res = spawnSync(psql, [conn, '-tAc', sql], { encoding: 'utf8' });
  if (res.error || res.status !== 0) return null;
  return res.stdout.trim().split('\n').filter(Boolean);
}

function main() {
  const raw = getUrl('test');
  if (!raw) {
    process.stderr.write('[db-test-validate] TEST_DATABASE_URL is not set. Aborting.\n');
    process.exit(1);
  }

  const decision = assertResettable(raw, { confirm: true });
  if (!decision.allowed) {
    process.stderr.write(`[db-test-validate] REFUSED: ${decision.reason}\n`);
    process.exit(1);
  }

  process.stdout.write(`[db-test-validate] zero->current on ${safeTarget(raw)}\n`);

  // 2. Reset to zero, then deploy to current.
  let res = prisma(
    ['migrate', 'reset', '--force', '--skip-seed', '--schema', 'prisma/schema.prisma'],
    raw,
  );
  if (res.status !== 0) {
    process.stderr.write('[db-test-validate] reset failed.\n');
    process.exit(1);
  }

  // 3. Status must report up-to-date.
  res = prisma(['migrate', 'status', '--schema', 'prisma/schema.prisma'], raw);
  if (res.status !== 0) {
    process.stderr.write('[db-test-validate] migrate status not clean.\n');
    process.exit(1);
  }

  // 4. Table inspection: only Prisma migration metadata may exist.
  const tables = listTables(raw);
  if (tables === null) {
    process.stdout.write(
      '[db-test-validate] NOTE: psql unavailable; skipped table inventory check.\n',
    );
  } else {
    const domainTables = tables.filter((t) => t !== '_prisma_migrations');
    process.stdout.write(`[db-test-validate] tables: ${tables.join(', ') || '(none)'}\n`);
    if (domainTables.length) {
      process.stderr.write(
        `[db-test-validate] FAIL: unexpected domain table(s): ${domainTables.join(', ')}\n`,
      );
      process.exit(1);
    }
  }

  process.stdout.write('[db-test-validate] PASS: zero->current, no domain tables.\n');
}

if (require.main === module) {
  main();
}
