/**
 * CLP-00-11 — Synthetic seed integration tests (live DB, clp_test only).
 *
 * These run against the ISOLATED test database (`TEST_DATABASE_URL` = clp_test)
 * only, and SKIP (never fail) when it is unavailable. They prove the seed's
 * contract-level guarantees:
 *
 *   - the seed creates the frozen synthetic fixtures with the exact roles/state
 *     and a credential that verifies against the synthetic plaintext;
 *   - a rerun is IDEMPOTENT: running twice leaves exactly one row per fixture
 *     (no duplicates) with the same stable public identity;
 *   - the seed NEVER overwrites non-synthetic data: a pre-existing non-fixture
 *     user (outside the `example.invalid` namespace) is left untouched.
 *
 * Every value here is synthetic. The seed logic is imported from the repo
 * `scripts/seed/` command so the test exercises the REAL code path.
 */
import { PrismaClient } from '@prisma/client';
import { scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { classifyUrl } from '../../../../scripts/db/db-url.cjs';
import { getUrl } from '../../../../scripts/db/env.cjs';
import { ensureFixture } from '../../../../scripts/seed/db-seed-synthetic.cjs';
import { resolveAllFixtures } from '../../../../scripts/seed/synthetic-fixtures.cjs';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const TEST_URL = getUrl('test');
const target = TEST_URL ? classifyUrl(TEST_URL) : null;
const RUNNABLE = Boolean(target && target.database === 'clp_test' && target.isLocal);

const describeDb = RUNNABLE ? describe : describe.skip;

/** Run the REAL seed ensure path over the given client. */
async function runSeed(prisma: PrismaClient): Promise<void> {
  for (const fixture of resolveAllFixtures()) {
    await ensureFixture(prisma, fixture);
  }
}

/** Verify a plaintext password against an API-format encoded scrypt hash. */
async function verify(plain: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  const m = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parts[1] ?? '');
  if (!m) return false;
  const N = Number(m[1]);
  const r = Number(m[2]);
  const p = Number(m[3]);
  const salt = Buffer.from(parts[2], 'base64');
  const expected = Buffer.from(parts[3], 'base64');
  const intrinsic = 128 * N * r;
  const actual = await scrypt(plain, salt, expected.length, {
    N,
    r,
    p,
    maxmem: Math.max(32 * 1024 * 1024, intrinsic * 2),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

describeDb('synthetic seed (clp_test)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  const fixtureNormalized = resolveAllFixtures().map((f) => f.login.toLowerCase());
  const outsiderLoginNormalized = 'clp-00-11-outsider-not-a-fixture';

  async function cleanup(): Promise<void> {
    // Delete ONLY the rows this suite could create (fixtures + the outsider).
    await prisma.user.deleteMany({
      where: { loginNormalized: { in: [...fixtureNormalized, outsiderLoginNormalized] } },
    });
  }

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('creates the frozen fixtures with exact roles/state and a verifiable hash', async () => {
    await runSeed(prisma);

    for (const fixture of resolveAllFixtures()) {
      const user = await prisma.user.findUnique({
        where: { loginNormalized: fixture.login.toLowerCase() },
        include: { roles: { select: { role: true } }, credential: true },
      });
      expect(user).not.toBeNull();
      expect(user!.state).toBe(fixture.state);
      expect(user!.roles.map((r) => r.role).sort()).toEqual([...fixture.roles].sort());
      expect(user!.credential).not.toBeNull();
      expect(user!.credential!.hash).toMatch(/^scrypt\$/);
      expect(await verify(fixture.password, user!.credential!.hash)).toBe(true);
    }
  });

  it('is idempotent: a rerun does not duplicate rows or change the public id', async () => {
    await runSeed(prisma);
    const first = await prisma.user.findMany({
      where: { loginNormalized: { in: fixtureNormalized } },
    });
    const before = new Map(first.map((u) => [u.loginNormalized, u.publicId]));

    await runSeed(prisma);

    const after = await prisma.user.findMany({
      where: { loginNormalized: { in: fixtureNormalized } },
    });
    expect(after).toHaveLength(fixtureNormalized.length);
    for (const u of after) {
      expect(before.get(u.loginNormalized)).toBe(u.publicId);
    }
  });

  it('never overwrites a non-synthetic user', async () => {
    const outsider = await prisma.user.create({
      data: {
        login: 'outsider@real.example.org',
        loginNormalized: outsiderLoginNormalized,
        state: 'ACTIVE',
        roles: { create: [{ role: 'STUDENT' }] },
      },
    });

    await runSeed(prisma);

    const stillThere = await prisma.user.findUnique({
      where: { id: outsider.id },
      include: { roles: { select: { role: true } } },
    });
    expect(stillThere).not.toBeNull();
    expect(stillThere!.state).toBe('ACTIVE');
    expect(stillThere!.roles.map((r) => r.role)).toEqual(['STUDENT']);
  });
});
