#!/usr/bin/env node
/**
 * CLP-00-04 — Migration status inspector.
 *
 * Usage:
 *   node scripts/db/db-status.cjs [dev|test|both]   (default: both)
 *
 * For each requested environment it resolves the URL from the git-ignored
 * `.env` (or the shell) and runs `prisma migrate status`, printing a redacted
 * target line first so operators can see WHICH database is inspected without
 * leaking credentials. Never performs a migration.
 *
 * Exit code: 0 if every requested environment was inspectable, else 1.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { safeTarget } = require('./db-url.cjs');
const { getUrl, REPO_ROOT } = require('./env.cjs');

function statusFor(which) {
  const label = which === 'dev' ? 'DEVELOPMENT' : 'TEST';
  const key = which === 'dev' ? 'DATABASE_URL' : 'TEST_DATABASE_URL';
  const raw = getUrl(which);

  if (!raw) {
    process.stdout.write(
      `\n=== ${label} database ===\n[skip] ${key} is not set (no local .env or shell value).\n`,
    );
    return { ok: false, skipped: true };
  }

  process.stdout.write(`\n=== ${label} database ===\ntarget: ${safeTarget(raw)}\n`);
  const prismaBin = path.join(
    REPO_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
  const res = spawnSync(prismaBin, ['migrate', 'status', '--schema', 'prisma/schema.prisma'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: raw },
  });
  if (res.error) {
    process.stderr.write(`[db-status] failed to run prisma: ${res.error.message}\n`);
    return { ok: false };
  }
  return { ok: res.status === 0, status: res.status };
}

function main() {
  const arg = (process.argv[2] || 'both').toLowerCase();
  const targets = arg === 'dev' ? ['dev'] : arg === 'test' ? ['test'] : ['dev', 'test'];

  let allOk = true;
  for (const t of targets) {
    const r = statusFor(t);
    if (!r.ok && !r.skipped) allOk = false;
  }
  return allOk ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}
