#!/usr/bin/env node
/**
 * CLP-00-11 — Deterministic synthetic seed command.
 *
 * Usage:
 *   node scripts/seed/db-seed-synthetic.cjs            # seed the development DB (clp_dev)
 *   node scripts/seed/db-seed-synthetic.cjs --env test # seed the isolated test DB (clp_test)
 *   node scripts/seed/db-seed-synthetic.cjs --dry-run  # plan only; no writes
 *
 * Guarantees (CLP-00-11 contract):
 *   - Target is ALWAYS a recognised LOCAL `clp_dev`/`clp_test`; anything else is
 *     refused (see seed-guard.cjs). Never runs automatically at startup.
 *   - Identities are DETERMINISTIC and live ONLY in the reserved
 *     `example.invalid` namespace.
 *   - Idempotent: a rerun ENSURES the named fixtures (create-if-missing, set the
 *     exact synthetic roles/state/credential) and never deletes or overwrites
 *     any row outside the named fixture set.
 *   - Password is hashed in the process (scrypt) via the SAME encoding the API
 *     verifies; no plaintext is written or logged. NO committed password.
 *   - Creates NO domain content (no profile/class/enrollment/content/exercise).
 *
 * Exit 0 on success, 1 on any refusal/failure, 2 on bad usage.
 */
'use strict';

const path = require('path');
const { classifyUrl, safeTarget } = require('../db/db-url.cjs');
const { getUrl, REPO_ROOT } = require('../db/env.cjs');
const { assertSeedable } = require('./seed-guard.cjs');
const { resolveAllFixtures } = require('./synthetic-fixtures.cjs');
const { hashPassword, hashParameters } = require('./scrypt-hash.cjs');

/** Load the generated Prisma client without requiring it at module top-level. */
function loadPrismaClient() {
  try {
    // Resolve from the repo root's installed `@prisma/client`.
    return require(path.join(REPO_ROOT, 'node_modules', '@prisma', 'client')).PrismaClient;
  } catch (err) {
    process.stderr.write(
      `[seed] unable to load @prisma/client (${err.message}). ` +
        'Run `npm run db:generate` first.\n',
    );
    process.exit(1);
  }
}

function parseArgs(argv) {
  const envIdx = argv.indexOf('--env');
  const env = envIdx !== -1 ? argv[envIdx + 1] : undefined;
  if (env !== undefined && env !== 'dev' && env !== 'test') {
    process.stderr.write('[seed] --env must be "dev" or "test".\n');
    process.exit(2);
  }
  return { env: env ?? 'dev', dryRun: argv.includes('--dry-run') };
}

/**
 * Ensure a single synthetic fixture exists with the exact synthetic roles and
 * account state, and a freshly-hashed credential.
 *
 * Only the named synthetic login is ever touched. If a row with that exact
 * normalized login already exists we UPDATE it (roles/state/credential); we
 * never touch any other row.
 */
async function ensureFixture(prisma, fixture) {
  const loginNormalized = fixture.login.toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { loginNormalized },
    include: { roles: { select: { role: true } } },
  });

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        login: fixture.login,
        loginNormalized,
        state: fixture.state,
        roles: { create: fixture.roles.map((role) => ({ role })) },
        credential: {
          create: {
            algorithm: 'scrypt',
            parameters: hashParameters(),
            hash: hashPassword(fixture.password),
          },
        },
      },
    });
    return { key: fixture.key, action: 'created', userId: created.id };
  }

  // Update the fixture in place (deterministic "ensure" semantics).
  await prisma.user.update({
    where: { id: existing.id },
    data: { state: fixture.state },
  });

  // Reconcile roles to EXACTLY the fixture set (add missing, remove extra).
  const current = new Set(existing.roles.map((r) => r.role));
  const desired = new Set(fixture.roles);
  const toAdd = fixture.roles.filter((r) => !current.has(r));
  const toRemove = [...current].filter((r) => !desired.has(r));
  for (const role of toAdd) {
    await prisma.userRoleAssignment.create({ data: { userId: existing.id, role } });
  }
  for (const role of toRemove) {
    await prisma.userRoleAssignment.delete({
      where: { userId_role: { userId: existing.id, role } },
    });
  }

  // Rotate the credential to the deterministic synthetic password (idempotent:
  // the same plaintext yields a new salt each run, which is fine and expected).
  const credential = {
    algorithm: 'scrypt',
    parameters: hashParameters(),
    hash: hashPassword(fixture.password),
  };
  await prisma.passwordCredential.upsert({
    where: { userId: existing.id },
    create: { userId: existing.id, ...credential },
    update: credential,
  });

  return { key: fixture.key, action: 'ensured', userId: existing.id };
}

async function main() {
  const { env, dryRun } = parseArgs(process.argv.slice(2));

  const raw = getUrl(env);
  if (!raw) {
    const key = env === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
    process.stderr.write(`[seed] ${key} is not set (set it in the git-ignored .env). Aborting.\n`);
    process.exit(1);
  }

  const decision = assertSeedable(raw);
  if (!decision.allowed) {
    process.stderr.write(`[seed] REFUSED: ${decision.reason}\n`);
    process.exit(1);
  }

  const fixtures = resolveAllFixtures();
  process.stdout.write(
    `[seed] target ${safeTarget(raw)} (${classifyUrl(raw).kind}) — ` +
      `${fixtures.length} synthetic fixture(s)${dryRun ? ' [dry-run]' : ''}\n`,
  );

  if (dryRun) {
    for (const f of fixtures) {
      process.stdout.write(
        `[seed]   would ensure ${f.login} roles=[${f.roles}] state=${f.state}\n`,
      );
    }
    process.stdout.write('[seed] dry-run complete; no writes performed.\n');
    return;
  }

  const PrismaClient = loadPrismaClient();
  const prisma = new PrismaClient({ datasources: { db: { url: raw } } });
  try {
    const results = [];
    for (const fixture of fixtures) {
      results.push(await ensureFixture(prisma, fixture));
    }
    for (const r of results) {
      process.stdout.write(`[seed]   ${r.action} ${r.key}\n`);
    }
    process.stdout.write(`[seed] PASS: ${results.length} synthetic fixture(s) ensured.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`[seed] FAILED: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { ensureFixture, parseArgs, main };
