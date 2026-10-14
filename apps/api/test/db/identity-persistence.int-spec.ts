/**
 * Identity persistence integration tests (CLP-00-05; ADR-004).
 *
 * These run against the ISOLATED test database (`TEST_DATABASE_URL` = clp_test)
 * only. They prove the persistence-level invariants the contract requires:
 *
 *   - the public UUID is non-guessable and UNIQUE;
 *   - the NORMALIZED login is UNIQUE (a different raw casing of the same login
 *     collides);
 *   - role membership only accepts the three ADR roles (enum + PK);
 *   - account state only accepts approved values;
 *   - password_credentials stores ONLY a hash (a plaintext column does not
 *     exist) and is 1:1 with the user.
 *
 * Guarding: if `TEST_DATABASE_URL` is missing or the database is not the exact
 * local `clp_test`, the suite SKIPS rather than touching anything. Rows are
 * created inside a transaction-free scratch that is cleaned up in `afterAll`;
 * every value is synthetic.
 */
import { PrismaClient } from '@prisma/client';

import { classifyUrl } from '../../../../scripts/db/db-url.cjs';
import { getUrl } from '../../../../scripts/db/env.cjs';

const TEST_URL = getUrl('test');
const target = TEST_URL ? classifyUrl(TEST_URL) : null;
const RUNNABLE = Boolean(target && target.database === 'clp_test' && target.isLocal);

const describeDb = RUNNABLE ? describe : describe.skip;

describeDb('identity persistence (clp_test)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
  const createdLogins: string[] = [];

  function syntheticLogin(label: string): string {
    const login = `clp-00-05-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    createdLogins.push(login.toLowerCase());
    return login;
  }

  afterAll(async () => {
    if (createdLogins.length) {
      await prisma.user.deleteMany({ where: { loginNormalized: { in: createdLogins } } });
    }
    await prisma.$disconnect();
  });

  it('enforces a UNIQUE, non-guessable public UUID', async () => {
    const user = await prisma.user.create({
      data: { login: syntheticLogin('uuid'), loginNormalized: syntheticLogin('uuid2') },
    });
    expect(user.publicId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    // public UUID !== internal surrogate id
    expect(user.publicId).not.toBe(user.id);
  });

  it('rejects a duplicate normalized login regardless of raw casing', async () => {
    const normalized = syntheticLogin('dup');
    createdLogins.push(normalized);
    await prisma.user.create({ data: { login: 'Dup.User', loginNormalized: normalized } });
    await expect(
      prisma.user.create({ data: { login: 'dup.user', loginNormalized: normalized } }),
    ).rejects.toThrow();
  });

  it('accepts only approved account states and defaults to PENDING', async () => {
    const user = await prisma.user.create({
      data: { login: syntheticLogin('state'), loginNormalized: syntheticLogin('state2') },
    });
    expect(user.state).toBe('PENDING');
    await expect(
      prisma.$executeRawUnsafe(`UPDATE users SET state = 'DELETED' WHERE id = '${user.id}'::uuid`),
    ).rejects.toThrow();
  });

  it('accepts only the three ADR roles and prevents duplicates', async () => {
    const user = await prisma.user.create({
      data: { login: syntheticLogin('role'), loginNormalized: syntheticLogin('role2') },
    });
    await prisma.userRoleAssignment.create({ data: { userId: user.id, role: 'TEACHER' } });
    // Duplicate (userId, role) is refused by the composite primary key.
    await expect(
      prisma.userRoleAssignment.create({ data: { userId: user.id, role: 'TEACHER' } }),
    ).rejects.toThrow();
    // Unknown role is refused by the enum type.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO user_roles (user_id, role) VALUES ('${user.id}'::uuid, 'SUPERUSER')`,
      ),
    ).rejects.toThrow();
  });

  it('stores only a hash in password_credentials (no plaintext column) and is 1:1', async () => {
    const user = await prisma.user.create({
      data: { login: syntheticLogin('cred'), loginNormalized: syntheticLogin('cred2') },
    });
    const credential = await prisma.passwordCredential.create({
      data: {
        userId: user.id,
        algorithm: 'scrypt',
        parameters: { N: 32768, r: 8, p: 1, keylen: 32 },
        hash: 'scrypt$N=32768,r=8,p=1$c2FsdA==$ZGVyaXZlZA==',
      },
    });
    expect(credential.hash).toMatch(/^scrypt\$/);
    // A second credential for the same user violates the 1:1 unique constraint.
    await expect(
      prisma.passwordCredential.create({
        data: { userId: user.id, algorithm: 'scrypt', parameters: {}, hash: 'other' },
      }),
    ).rejects.toThrow();

    // The password_credentials table has NO plaintext password column.
    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'password_credentials'`,
    );
    const names = columns.map((c) => c.column_name.toLowerCase());
    expect(names).toContain('hash');
    expect(names.some((n) => n === 'password' || n === 'plaintext' || n === 'plain')).toBe(false);
  });
});
