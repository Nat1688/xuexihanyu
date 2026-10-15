#!/usr/bin/env node
/**
 * CLP-00-11 — Production ADMIN bootstrap command (separate from the seed).
 *
 * Usage:
 *   CLP_BOOTSTRAP_ADMIN_LOGIN=you@example.org \
 *   CLP_BOOTSTRAP_ADMIN_PASSWORD='…' \
 *   node scripts/seed/db-bootstrap-admin.cjs            # bootstrap DEVELOPMENT DB (clp_dev)
 *
 *   … node scripts/seed/db-bootstrap-admin.cjs --env test
 *   … node scripts/seed/db-bootstrap-admin.cjs --dry-run   # preflight only, no writes
 *
 * Guarantees (CLP-00-11 contract):
 *   - Never runs at startup: this is an explicit, operator-invoked command only.
 *   - Requires the login via `CLP_BOOTSTRAP_ADMIN_LOGIN` and the initial secret
 *     via `CLP_BOOTSTRAP_ADMIN_PASSWORD` (shell or the git-ignored `.env`). No
 *     password is ever hard-coded, echoed or committed.
 *   - REFUSES when ANY ADMIN role membership already exists — bootstrap never
 *     replaces or resets an existing admin.
 *   - REFUSES a non-local database host, a missing login, or a too-short secret.
 *   - Hashes the secret in-process (scrypt, API-verifiable encoding) and stores
 *     HASH ONLY; creates the single admin user with the ADMIN role and ACTIVE
 *     state. Creates NO domain content.
 *
 * Exit 0 on success, 1 on any refusal/failure, 2 on bad usage.
 */
'use strict';

const path = require('path');
const { safeTarget } = require('../db/db-url.cjs');
const { getUrl, REPO_ROOT, resolveKey, parseEnvFile, ENV_FILE } = require('../db/env.cjs');
const {
  assertBootstrappable,
  assertNoExistingAdmin,
  BOOTSTRAP_LOGIN_ENV,
  BOOTSTRAP_PASSWORD_ENV,
} = require('./seed-guard.cjs');
const { hashPassword, hashParameters } = require('./scrypt-hash.cjs');

/**
 * Load the bootstrap secret, preferring an explicit shell value over the
 * git-ignored `.env` file. The secret is returned but NEVER logged.
 */
function loadSecret() {
  return resolveKey(BOOTSTRAP_PASSWORD_ENV, parseEnvFile(ENV_FILE));
}

function loadPrismaClient() {
  try {
    return require(path.join(REPO_ROOT, 'node_modules', '@prisma', 'client')).PrismaClient;
  } catch (err) {
    process.stderr.write(
      `[bootstrap] unable to load @prisma/client (${err.message}). Run \`npm run db:generate\` first.\n`,
    );
    process.exit(1);
  }
}

function parseArgs(argv) {
  const envIdx = argv.indexOf('--env');
  const env = envIdx !== -1 ? argv[envIdx + 1] : undefined;
  if (env !== undefined && env !== 'dev' && env !== 'test') {
    process.stderr.write('[bootstrap] --env must be "dev" or "test".\n');
    process.exit(2);
  }
  return { env: env ?? 'dev', dryRun: argv.includes('--dry-run') };
}

async function main() {
  const { env, dryRun } = parseArgs(process.argv.slice(2));

  const raw = getUrl(env);
  if (!raw) {
    const key = env === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
    process.stderr.write(
      `[bootstrap] ${key} is not set (set it in the git-ignored .env). Aborting.\n`,
    );
    process.exit(1);
  }

  const login = process.env[BOOTSTRAP_LOGIN_ENV];
  const password = loadSecret();

  const decision = assertBootstrappable({ url: raw, login, password });
  if (!decision.allowed) {
    process.stderr.write(`[bootstrap] REFUSED: ${decision.reason}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `[bootstrap] target ${safeTarget(raw)} — admin login ${decision.login}` +
      `${dryRun ? ' [dry-run]' : ''}\n`,
  );

  const PrismaClient = loadPrismaClient();
  const prisma = new PrismaClient({ datasources: { db: { url: raw } } });
  try {
    // Refuse if ANY admin membership already exists (never replace an admin).
    const existingAdminCount = await prisma.userRoleAssignment.count({
      where: { role: 'ADMIN' },
    });
    const adminCheck = assertNoExistingAdmin({ existingAdminCount });
    if (!adminCheck.allowed) {
      process.stderr.write(`[bootstrap] REFUSED: ${adminCheck.reason}\n`);
      process.exit(1);
    }

    if (dryRun) {
      process.stdout.write('[bootstrap] dry-run: preflight passed; no writes performed.\n');
      return;
    }

    const loginNormalized = decision.login.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { loginNormalized } });

    if (existing) {
      // No admin exists yet; promote/ensure this named user is an ACTIVE admin.
      await prisma.user.update({ where: { id: existing.id }, data: { state: 'ACTIVE' } });
      await prisma.userRoleAssignment.upsert({
        where: { userId_role: { userId: existing.id, role: 'ADMIN' } },
        create: { userId: existing.id, role: 'ADMIN' },
        update: {},
      });
      const credential = {
        algorithm: 'scrypt',
        parameters: hashParameters(),
        hash: hashPassword(password),
      };
      await prisma.passwordCredential.upsert({
        where: { userId: existing.id },
        create: { userId: existing.id, ...credential },
        update: credential,
      });
      process.stdout.write(`[bootstrap] PASS: promoted existing user to ADMIN.\n`);
    } else {
      await prisma.user.create({
        data: {
          login: decision.login,
          loginNormalized,
          state: 'ACTIVE',
          roles: { create: [{ role: 'ADMIN' }] },
          credential: {
            create: {
              algorithm: 'scrypt',
              parameters: hashParameters(),
              hash: hashPassword(password),
            },
          },
        },
      });
      process.stdout.write('[bootstrap] PASS: created the initial ADMIN.\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`[bootstrap] FAILED: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { parseArgs, loadSecret, main };
