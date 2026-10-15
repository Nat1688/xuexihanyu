/**
 * CLP-00-11 — ADMIN bootstrap integration tests (live DB, clp_test only).
 *
 * These run against the ISOLATED test database (`TEST_DATABASE_URL` = clp_test)
 * only, and SKIP (never fail) when it is unavailable. They prove the bootstrap
 * command's contract-level refusals against REAL database state:
 *
 *   - it REFUSES when an ADMIN role membership already exists (never replaces or
 *     resets an existing admin);
 *   - it proceeds (guard-wise) only when no admin exists AND the login + secret
 *     are supplied AND the target is local.
 *
 * The logic under test is imported from the repo `scripts/seed/` guard so the
 * test exercises the REAL refusal decisions. Every value here is synthetic.
 */
import { PrismaClient } from '@prisma/client';

import { classifyUrl } from '../../../../scripts/db/db-url.cjs';
import { getUrl } from '../../../../scripts/db/env.cjs';
import {
  assertBootstrappable,
  assertNoExistingAdmin,
} from '../../../../scripts/seed/seed-guard.cjs';

const TEST_URL = getUrl('test');
const target = TEST_URL ? classifyUrl(TEST_URL) : null;
const RUNNABLE = Boolean(target && target.database === 'clp_test' && target.isLocal);

const describeDb = RUNNABLE ? describe : describe.skip;

describeDb('admin bootstrap (clp_test)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  const addedLogins: string[] = [];

  async function cleanup(): Promise<void> {
    if (addedLogins.length) {
      await prisma.user.deleteMany({ where: { loginNormalized: { in: addedLogins } } });
    }
  }

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('refuses when an ADMIN role membership already exists', async () => {
    const login = `clp-00-11-admin-${Date.now()}`;
    addedLogins.push(login.toLowerCase());
    await prisma.user.create({
      data: {
        login,
        loginNormalized: login.toLowerCase(),
        state: 'ACTIVE',
        roles: { create: [{ role: 'ADMIN' }] },
      },
    });

    const count = await prisma.userRoleAssignment.count({ where: { role: 'ADMIN' } });
    expect(count).toBeGreaterThan(0);
    const decision = assertNoExistingAdmin({ existingAdminCount: count });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/already exists/);
  });

  it('refuses on a missing secret even when no admin exists (guard preflight)', () => {
    const decision = assertBootstrappable({
      url: TEST_URL,
      login: 'owner@clp.example.org',
      password: undefined,
    });
    expect(decision.allowed).toBe(false);
  });

  it('refuses on a missing login', () => {
    const decision = assertBootstrappable({
      url: TEST_URL,
      login: undefined,
      password: 'a-long-enough-synthetic-secret',
    });
    expect(decision.allowed).toBe(false);
  });

  it('refuses a non-local target regardless of credentials', () => {
    const decision = assertBootstrappable({
      url: 'postgresql://clp_app:pw@db.example.com:5432/clp_dev',
      login: 'owner@clp.example.org',
      password: 'a-long-enough-synthetic-secret',
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/non-local/);
  });

  it('proceeds guard-wise only when local + login + secret are all present', () => {
    const decision = assertBootstrappable({
      url: TEST_URL,
      login: 'owner@clp.example.org',
      password: 'a-long-enough-synthetic-secret',
    });
    expect(decision.allowed).toBe(true);
  });
});
