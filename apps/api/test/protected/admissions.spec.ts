import { RegistrationService } from '../../src/modules/identity/application/registration.service';
import { CourseAccessService } from '../../src/modules/admissions/course-access.service';
import { AdmissionsService } from '../../src/modules/admissions/admissions.service';
import { PrismaService } from '../../src/modules/foundation/prisma.service';
import { ScryptPasswordHasher } from '../../src/modules/identity/infrastructure/scrypt-password-hasher';

describe('ENROLL-01 signup boundary', () => {
  function setup() {
    const create = jest.fn().mockResolvedValue({ publicId: 'synthetic' });
    const hash = jest
      .fn()
      .mockResolvedValue({ algorithm: 'scrypt', parameters: { N: 32768 }, hash: 'synthetic-hash' });
    return {
      create,
      hash,
      service: new RegistrationService(
        { user: { create } } as unknown as PrismaService,
        { hash } as unknown as ScryptPasswordHasher,
      ),
    };
  }
  it('normalizes email, forces ACTIVE/STUDENT, and persists only hashed credentials despite role injection', async () => {
    const s = setup();
    await s.service.register(
      {
        login: '  NEW@Example.Invalid ',
        password: 'synthetic-password',
        confirmPassword: 'synthetic-password',
        roles: ['ADMIN'],
        state: 'ACTIVE',
      } as unknown as Parameters<RegistrationService['register']>[0],
      'synthetic-ip',
    );
    expect(s.create).toHaveBeenCalledWith({
      data: {
        login: 'new@example.invalid',
        loginNormalized: 'new@example.invalid',
        state: 'ACTIVE',
        roles: { create: { role: 'STUDENT' } },
        credential: {
          create: { algorithm: 'scrypt', parameters: { N: 32768 }, hash: 'synthetic-hash' },
        },
      },
      select: { publicId: true },
    });
    expect(JSON.stringify(s.create.mock.calls)).not.toContain('synthetic-password');
  });
  it.each([
    { login: 'bad' },
    { password: 'short', confirmPassword: 'short' },
    { confirmPassword: 'mismatch' },
    { password: 'x'.repeat(129), confirmPassword: 'x'.repeat(129) },
    { login: null },
    { password: 42 },
  ])('rejects invalid signup before hashing or writing: %p', async (bad) => {
    const s = setup();
    await expect(
      s.service.register(
        {
          login: 'new@example.invalid',
          password: 'synthetic-password',
          confirmPassword: 'synthetic-password',
          ...bad,
        },
        'ip',
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(s.hash).not.toHaveBeenCalled();
    expect(s.create).not.toHaveBeenCalled();
  });
  it('bounds repeated registration of one normalized email behind a shared proxy', async () => {
    const s = setup();
    for (let i = 0; i < 10; i++)
      await s.service.register(
        {
          login: `test@example.invalid`,
          password: 'synthetic-password',
          confirmPassword: 'synthetic-password',
        },
        'same-ip',
      );
    await expect(
      s.service.register(
        {
          login: 'TEST@example.invalid',
          password: 'synthetic-password',
          confirmPassword: 'synthetic-password',
        },
        'same-ip',
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(s.hash).toHaveBeenCalledTimes(10);
  });
  it('does not lock out distinct students sharing nginx after ten signups', async () => {
    const s = setup();
    for (let i = 0; i < 12; i++)
      await s.service.register(
        {
          login: `student${i}@example.invalid`,
          password: 'synthetic-password',
          confirmPassword: 'synthetic-password',
        },
        'nginx-peer',
      );
    expect(s.create).toHaveBeenCalledTimes(12);
  });
});
describe('ENROLL-01 course access', () => {
  const actor = { publicId: 'student-public', roles: ['STUDENT'] };
  function setup(ids: string[]) {
    const findMany = jest.fn().mockResolvedValue(ids.map((publicId) => ({ course: { publicId } })));
    return {
      findMany,
      access: new CourseAccessService({
        courseApplication: { findMany },
        lesson: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ unit: { course: { publicId: 'approved-course' } } }),
        },
      } as unknown as PrismaService),
    };
  }
  it('an existing student has no implicit grant from a class or historical exercises', async () => {
    const s = setup([]);
    await expect(s.access.assert(actor, 'lesson', 'lesson-id')).rejects.toMatchObject({
      status: 404,
    });
    expect(s.findMany.mock.calls[0][0].where).toEqual({
      student: { publicId: 'student-public', state: 'ACTIVE' },
      status: 'APPROVED',
    });
  });
  it('grants only the approved course; cannot substitute another course identifier', async () => {
    const s = setup(['approved-course']);
    await s.access.assert(actor, 'lesson', 'lesson-id');
    await expect(s.access.assert(actor, 'course', 'other-course')).rejects.toMatchObject({
      status: 404,
    });
  });
  it.each(['ADMIN', 'TEACHER'])(
    'retains authoring access for server-derived %s role',
    async (role) => {
      const s = setup([]);
      await s.access.assert({ publicId: 'teacher', roles: [role] }, 'course', 'course');
      expect(s.findMany).not.toHaveBeenCalled();
    },
  );
});
describe('ENROLL-01 review boundary', () => {
  it('rejects student review before database I/O', async () => {
    const db = { $transaction: jest.fn() };
    const service = new AdmissionsService(db as unknown as PrismaService);
    await expect(
      service.decide({ publicId: 'student', roles: ['STUDENT'] }, 'bad-id', {
        decision: 'APPROVED',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects an approval without a destination class before the transaction', async () => {
    const db = { $transaction: jest.fn() };
    const service = new AdmissionsService(db as unknown as PrismaService);
    await expect(
      service.decide(
        { publicId: 'teacher', roles: ['TEACHER'] },
        '00000000-0000-4000-8000-000000000001',
        { decision: 'APPROVED' },
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
